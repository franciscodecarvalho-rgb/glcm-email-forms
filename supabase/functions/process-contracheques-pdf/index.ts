import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getDocumentProxy } from "npm:unpdf@1.4.0";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
type TextItem = { str: string; x: number; y: number; width: number; height: number };
type Tipo = "provento" | "desconto" | "informativo";
type Rubrica = { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: Tipo; familia_hra: string | null };
type Contra = { competencia: string | null; modelo_origem: string; total_proventos: number | null; total_descontos: number | null; liquido: number | null; itens: Rubrica[] };
type Linha = { y: number; itens: TextItem[]; texto: string };
const MODELO_IA = "google/gemini-2.5-pro";
const PROMPT_IA = `Extraia contracheques deste PDF somente quando a leitura automática/OCR não tiver produzido dados estruturados. Retorne um registro por competência. Não invente códigos, descrições, referências, valores ou totais. Classifique cada rubrica como provento, desconto ou informativo conforme a coluna/seção visível. Valores devem ser números positivos; use null para totais ilegíveis. Ignore páginas e cópias repetidas.`;
const TOOL_IA = { type:"function", function:{ name:"registrar_contracheques", parameters:{ type:"object", properties:{ contracheques:{ type:"array", items:{ type:"object", properties:{
  competencia:{ type:["string","null"] }, modelo_origem:{ type:"string" }, total_proventos:{ type:["number","null"] }, total_descontos:{ type:["number","null"] }, liquido:{ type:["number","null"] },
  itens:{ type:"array", items:{ type:"object", properties:{ codigo:{ type:"string" }, descricao:{ type:"string" }, referencia:{ type:["number","null"] }, valor:{ type:"number" }, tipo:{ type:"string", enum:["provento","desconto","informativo"] } }, required:["codigo","descricao","referencia","valor","tipo"], additionalProperties:false } },
}, required:["competencia","modelo_origem","total_proventos","total_descontos","liquido","itens"], additionalProperties:false } } }, required:["contracheques"], additionalProperties:false } } };
const CODIGO = /^\/?[A-Z0-9]{3,6}$/i;
const VALOR = /^-?(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-?(?:R\$)?\s*\d+,\d{2}$/i;
const MESES: Record<string, string> = { janeiro:"01",fevereiro:"02",marco:"03",abril:"04",maio:"05",junho:"06",julho:"07",agosto:"08",setembro:"09",outubro:"10",novembro:"11",dezembro:"12",jan:"01",fev:"02",mar:"03",abr:"04",mai:"05",jun:"06",jul:"07",ago:"08",set:"09",out:"10",nov:"11",dez:"12" };
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const moeda = (s: string) => Number(s.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
function base64(bytes:Uint8Array){let value="";for(let i=0;i<bytes.length;i+=0x8000)value+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(value);}

async function extrairComIa(bytes:Uint8Array,nome:string,apiKey:string):Promise<Contra[]>{
  const resposta=await fetch("https://ai.gateway.lovable.dev/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:MODELO_IA,messages:[{role:"system",content:PROMPT_IA},{role:"user",content:[{type:"text",text:`Arquivo: ${nome}`},{type:"image_url",image_url:{url:`data:application/pdf;base64,${base64(bytes)}`}}]}],
    tools:[TOOL_IA],tool_choice:{type:"function",function:{name:"registrar_contracheques"}},
  })});
  if(resposta.status===402)throw new Error("Créditos de IA do Lovable esgotados");
  if(!resposta.ok)throw new Error(`IA ${resposta.status}: ${(await resposta.text()).slice(0,180)}`);
  const payload=await resposta.json();
  const argumentos=payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if(!argumentos)throw new Error("A IA não retornou contracheques estruturados");
  const dados=JSON.parse(argumentos)?.contracheques;
  if(!Array.isArray(dados))throw new Error("Resposta inválida da IA");
  return dados.flatMap((contra:Record<string,unknown>)=>{
    const itens=Array.isArray(contra.itens)?contra.itens.flatMap((item:Record<string,unknown>)=>{
      const descricao=typeof item.descricao==="string"?item.descricao.trim():"";
      const valor=Number(item.valor);
      const tipo=item.tipo;
      if(!descricao||!Number.isFinite(valor)||valor<0||!(tipo==="provento"||tipo==="desconto"||tipo==="informativo"))return [];
      const codigo=typeof item.codigo==="string"?item.codigo.trim().toUpperCase():"";
      return [{codigo,descricao,referencia:Number.isFinite(Number(item.referencia))?Number(item.referencia):null,valor,tipo,familia_hra:familia(codigo,descricao,typeof contra.modelo_origem==="string"?contra.modelo_origem:"")} as Rubrica];
    }):[];
    if(!itens.length)return [];
    const numeroOuNull=(valor:unknown)=>valor==null||!Number.isFinite(Number(valor))?null:Math.abs(Number(valor));
    return [{competencia:typeof contra.competencia==="string"?contra.competencia:null,modelo_origem:typeof contra.modelo_origem==="string"&&contra.modelo_origem?contra.modelo_origem:"ia_fallback",total_proventos:numeroOuNull(contra.total_proventos),total_descontos:numeroOuNull(contra.total_descontos),liquido:numeroOuNull(contra.liquido),itens}];
  });
}

// Extrai texto+coordenadas só das páginas [inicio, fim] (1-based, inclusive) —
// não do PDF inteiro — para manter cada lote com custo de memória/CPU limitado.
async function extrairItensDoIntervalo(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, inicio: number, fim: number) {
  const paginas: TextItem[][] = [];
  for (let numero = inicio; numero <= fim; numero++) {
    const pagina = await pdf.getPage(numero);
    const conteudo = await pagina.getTextContent();
    paginas.push(conteudo.items.flatMap((item) => {
      if (!("str" in item) || !("transform" in item)) return [];
      return [{
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }];
    }));
    pagina.cleanup();
  }
  return paginas;
}

function expandir(itens: TextItem[]) {
  return itens.flatMap((item) => {
    const partes = item.str.trim().split(/\s+/);
    if (partes.length <= 1) return [item];
    const total = partes.reduce((s, p) => s + p.length, 0) + partes.length - 1;
    let x = item.x;
    return partes.map((str) => {
      const width = item.width * str.length / total;
      const novo = { ...item, str, x, width };
      x += width + item.width / total;
      return novo;
    });
  });
}

function linhas(itens: TextItem[]): Linha[] {
  const out: Linha[] = [];
  for (const item of expandir(itens).sort((a,b) => b.y-a.y || a.x-b.x)) {
    if (!item.str.trim()) continue;
    const linha = out.find((l) => Math.abs(l.y-item.y) <= Math.max(2.5,item.height*.35));
    if (linha) linha.itens.push(item); else out.push({ y:item.y,itens:[item],texto:"" });
  }
  return out.sort((a,b)=>b.y-a.y).map((l) => {
    l.itens.sort((a,b)=>a.x-b.x);
    l.texto=l.itens.map((i)=>i.str).join(" ").replace(/\s+/g," ").trim();
    return l;
  });
}

function modelo(texto: string) {
  const n=norm(texto);
  if(n.includes("companhia brasileira de estireno")||n.includes("unigel"))return "unigel";
  if(n.includes("elekeiroz"))return "elekeiroz";
  if(n.includes("termobahia")||n.includes("termo bahia"))return "termo_bahia";
  if(n.includes("petroleo brasileiro")||n.includes("petrobras"))return "petrobras";
  if(n.includes("termomacae"))return "termomacae";
  if(n.includes("braskem"))return "braskem";
  if(n.includes("basf"))return "basf";
  if(n.includes("refinaria de mataripe"))return "acelen";
  return "generico";
}

function competencia(texto: string) {
  const n=norm(texto);
  // 1) Nome do mês (mais específico). Aceita espaços entre letras (PDFs com
  //    texto fragmentado, ex.: "mar c o 2021"). Evita pegar a data de admissão
  //    (DD.MM.AAAA) como competência no BASF.
  for(const [nome,numero] of Object.entries(MESES)){
    const comEspacos=nome.replace(/(.)/g,"$1\\s*");
    const separado=n.match(new RegExp(`\\b${comEspacos}[/.-](20\\d{2})\\b`));if(separado)return `${numero}/${separado[1]}`;
    const a=n.match(new RegExp(`\\b${comEspacos}\\s+(?:de\\s+)?(20\\d{2})\\b`)); if(a)return `${numero}/${a[1]}`;
    const b=n.match(new RegExp(`\\d{1,2}[/-]${comEspacos}[/-](20\\d{2})`)); if(b)return `${numero}/${b[1]}`;
  }
  // 2) MM/AAAA com prefixo explícito (evita datas soltas como "11.2013").
  const comPrefixo=n.match(/(?:mes\s*\/\s*ano|competencia|referencia|referente|pagamento referente)[:\s-]*(0[1-9]|1[0-2])\s*[/]\s*(20\d{2})/i);
  if(comPrefixo)return `${comPrefixo[1]}/${comPrefixo[2]}`;
  // 3) MM/AAAA isolado (não precedido de dígito, evitando DD.MM.AAAA).
  const isolado=n.match(/(?<!\d)(?:0[1-9]|1[0-2])\s*[/]\s*(20\d{2})(?!\d)/);
  if(isolado)return `${isolado[0].slice(0,2)}/${isolado[2]}`;
  return null;
}

// BASF: competência confiável é a "Data de Crédito" do rodapé (último dia do mês).
// Cobre inclusive recibos de 13º/adiantamento com ano truncado em "Pagamento Referente".
function competenciaBasf(ls: Linha[]): string | null {
  for(let i=0;i<ls.length;i++){
    const rotulo=norm(ls[i].texto).replace(/\s+/g,"");
    if(!rotulo.includes("datadecredito"))continue;
    const valor=ls[i+1]?.texto??"";
    const m=valor.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if(m)return `${m[2].padStart(2,"0")}/${m[3]}`;
  }
  return null;
}

function familia(codigo: string, descricao: string, modeloOrigem: string) {
  const codigoNormalizado=codigo.trim().toUpperCase();
  if((modeloOrigem==="basf"&&codigoNormalizado==="3A20")||(modeloOrigem==="braskem"&&codigoNormalizado==="1004"))return "hra";
  const n=norm(descricao); if(!/hra/.test(n))return null;
  if(/\bdif/.test(n)||/\bdi\b/.test(n))return "dif_ahra";
  if(/dobra/.test(n))return "ahra_dobra";
  if(/adic/.test(n))return "adicional_hra";
  return /ahra/.test(n)?"ahra":"hra";
}

function parsePagina(itens: TextItem[], largura: number): Contra {
  const modeloPagina=modelo(itens.map((i)=>i.str).join(" "));
  const larguraLeitura=modeloPagina==="termo_bahia"?largura/2:largura;
  const itensLeitura=modeloPagina==="termo_bahia"?itens.filter((i)=>i.x<larguraLeitura):itens;
  const ls=linhas(itensLeitura), texto=ls.map((l)=>l.texto).join("\n"), modelo_origem=modelo(texto);
  const header=ls.find((l)=>{const n=norm(l.texto);return(/descricao/.test(n)&&/provent|venciment|valor/.test(n))||(/venciment/.test(n)&&/descont/.test(n));});
  const x=(r:RegExp)=>header?.itens.find((i)=>r.test(norm(i.str)))?.x??null;
  const xdesc=x(/descricao/), xp=x(/provent|venciment|valor/), xd=x(/descont/), xr=x(/referencia|quant|qtde/);
  let secao:Tipo="provento", info=false, total_proventos:number|null=null,total_descontos:number|null=null,liquido:number|null=null;
  const rubricas:Rubrica[]=[];
  const valores=(l:Linha)=>l.itens.filter((i)=>VALOR.test(i.str.trim()));
  for(const l of ls){
    const n=norm(l.texto), vs=valores(l);
    if(/base\s*\/\s*outros|custo\s+empresa.*informativo/.test(n))info=true;
    if(/total(?:\s+de)?\s+(?:proventos|vencimentos)/.test(n)){total_proventos=vs[0]?moeda(vs[0].str):null;secao="desconto";continue;}
    if(/total(?:\s+de)?\s+descontos/.test(n)){total_descontos=vs[0]?moeda(vs[0].str):null;continue;}
    if(/\btotais?\b/.test(n)&&vs.length>=2){total_proventos??=moeda(vs[0].str);total_descontos??=moeda(vs[1].str);liquido??=vs[2]?moeda(vs[2].str):null;}
    if(/valor\s+liquido|liquido\s+creditado|total\s+liquido/.test(n)&&vs.length)liquido=moeda(vs[vs.length-1].str);
    const cod=modelo_origem==="elekeiroz"?undefined:l.itens.find((i)=>i.x<larguraLeitura*.22&&CODIGO.test(i.str.trim())); if(!cod&&modelo_origem!=="elekeiroz")continue;
    const candidatos=vs.filter((i)=>i.x>larguraLeitura*.28); if(!candidatos.length)continue;
    const vi=candidatos[candidatos.length-1], inicio=xdesc??(cod?cod.x+cod.width:0);
    const limite=[xr,xp,xd,larguraLeitura*.82].filter((v):v is number=>v!=null&&v>inicio).sort((a,b)=>a-b)[0];
    const descricao=l.itens.filter((i)=>i.x>=inicio-larguraLeitura*.01&&i.x<limite&&i.str!=="|").map((i)=>i.str).join(" ").replace(/\s+/g," ").trim();
    if(!descricao)continue;
    const fimRef=[xdesc,xp,xd,larguraLeitura].filter((v):v is number=>v!=null&&xr!=null&&v>xr).sort((a,b)=>a-b)[0]??larguraLeitura;
    const ri=xr==null?null:l.itens.find((i)=>i.x>=xr-larguraLeitura*.025&&i.x<fimRef);
    const rs=ri?.str.trim()??"";
    const referencia=/^\d+(?:[.,]\d+)?$/.test(rs)?(rs.includes(",")?Number(rs.replace(/\./g,"").replace(",",".")):Number(rs)):null;
    const tipo:Tipo=info?"informativo":modelo_origem==="petrobras"||modelo_origem==="unigel"?secao:modelo_origem==="elekeiroz"?(vi.x>=larguraLeitura*.78?"desconto":"provento"):(xd!=null&&Math.abs(vi.x-xd)<Math.abs(vi.x-(xp??0))?"desconto":"provento");
    const codigo=cod?.str.trim().toUpperCase()??"";
    rubricas.push({codigo,descricao,referencia,valor:Math.abs(moeda(vi.str)),tipo,familia_hra:familia(codigo,descricao,modelo_origem)});
  }
  if(!/\bcontinua\b/.test(norm(texto))){
    total_proventos??=rubricas.filter((i)=>i.tipo==="provento").reduce((s,i)=>s+i.valor,0)||null;
    total_descontos??=rubricas.filter((i)=>i.tipo==="desconto").reduce((s,i)=>s+i.valor,0)||null;
    liquido??=total_proventos!=null&&total_descontos!=null?total_proventos-total_descontos:null;
  }
  return{competencia:modelo_origem==="basf"?(competenciaBasf(ls)??competencia(texto)):competencia(texto),modelo_origem,total_proventos,total_descontos,liquido,itens:rubricas};
}

// ---------------- consolidação incremental (por lote, com estado entre lotes) ----------------
// Mesmo critério que decidia, no consolidador original de arquivo inteiro,
// quando uma página nova é a CONTINUAÇÃO do contracheque atual (mesma
// competência/modelo, ainda sem os dois totais) em vez de iniciar um novo.
function continuaMesmoContra(atual: Contra, p: Contra): boolean {
  const continuaElekeiroz = atual.modelo_origem==="elekeiroz" && p.modelo_origem==="elekeiroz" && atual.competencia===p.competencia;
  const novaCompetencia = atual.competencia!=null && p.competencia!=null && atual.competencia!==p.competencia;
  const novoModelo = atual.modelo_origem!=="generico" && p.modelo_origem!=="generico" && atual.modelo_origem!==p.modelo_origem;
  if(novaCompetencia||novoModelo)return false;
  if(!continuaElekeiroz && atual.total_proventos!=null && atual.total_descontos!=null)return false;
  return true;
}

function mesclarContra(atual: Contra, p: Contra): Contra {
  const mesclado: Contra = { ...atual, itens: [...atual.itens, ...p.itens] };
  if(p.total_proventos!=null) mesclado.total_proventos=p.total_proventos;
  if(p.total_descontos!=null) mesclado.total_descontos=p.total_descontos;
  if(p.liquido!=null) mesclado.liquido=p.liquido;
  return mesclado;
}

// Elimina rubricas repetidas dentro do MESMO contracheque (páginas continuadas
// ou duplicadas, ex.: cópia espelhada do Termo Bahia, continuação do Elekeiroz).
function dedupItens(contra: Contra): Contra {
  const vistos=new Set<string>();
  const itens=contra.itens.filter((item)=>{
    const chave=`${item.codigo}|${norm(item.descricao)}|${item.referencia}|${item.valor}|${item.tipo}`;
    if(vistos.has(chave))return false;
    vistos.add(chave);
    return true;
  });
  return { ...contra, itens };
}

// Assinatura para detectar um contracheque inteiro duplicado (ex.: página
// repetida no PDF). Independente da ordem das rubricas para funcionar mesmo
// quando o estado é reconstruído do banco numa retomada.
function assinaturaContra(c: Pick<Contra,"competencia"|"total_proventos"|"total_descontos"|"itens">): string {
  const itens=c.itens.map((i)=>`${i.codigo}:${i.valor}`).sort().join(",");
  return `${c.competencia}|${c.total_proventos}|${c.total_descontos}|${itens}`;
}

// Consolida as páginas de UM lote a partir do estado (contracheque ainda
// "aberto") vindo do lote anterior. Devolve os contracheques já fechados
// (prontos para persistir) e, se houver, o que ainda pode continuar no
// próximo lote — nunca mantém o restante do arquivo em memória.
function consolidarLote(paginas: Contra[], entrada: Contra | null): { fechados: Contra[]; aberto: Contra | null } {
  const validas=paginas.filter((p)=>p.itens.length||p.total_proventos!=null);
  const out: Contra[]=[];
  let atual: Contra | null = entrada ? { ...entrada, itens:[...entrada.itens] } : null;
  for(const p of validas){
    if(atual && continuaMesmoContra(atual,p)) atual=mesclarContra(atual,p);
    else { if(atual) out.push(atual); atual={ ...p, itens:[...p.itens] }; }
  }
  if(atual) out.push(atual);
  const fechados=out.slice(0,-1).map(dedupItens);
  const aberto=out.length?dedupItens(out[out.length-1]):null;
  return { fechados, aberto };
}

// Grava um contracheque fechado (com suas rubricas) imediatamente — nunca
// espera o arquivo/caso inteiro terminar para persistir.
async function persistirContra(supabase: any, casoId: string, contra: Contra, arquivoNome: string) {
  const { data: row, error: ie } = await supabase.from("contracheques").insert({
    caso_id: casoId, competencia: contra.competencia, total_proventos: contra.total_proventos,
    total_descontos: contra.total_descontos, liquido: contra.liquido, arquivo_origem: arquivoNome,
    modelo_origem: contra.modelo_origem,
  }).select("id").single();
  if(ie) throw ie;
  if(contra.itens.length){
    const { error: itemError } = await supabase.from("itens_contracheque")
      .insert(contra.itens.map((item)=>({ ...item, contracheque_id: row.id })));
    if(itemError) throw itemError;
  }
}

// Recorta só as páginas [inicio, fim] (1-based, inclusive) num PDF novo — é
// isso que vai para a IA, nunca o arquivo inteiro numa única requisição.
async function fatiarPaginas(bytesOriginal: Uint8Array, inicio: number, fim: number): Promise<Uint8Array> {
  const origem = await PDFDocument.load(bytesOriginal, { ignoreEncryption: true });
  const destino = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = inicio; i <= fim; i++) indices.push(i - 1); // pdf-lib é 0-based
  const paginas = await destino.copyPages(origem, indices);
  paginas.forEach((p) => destino.addPage(p));
  return await destino.save();
}

const TAMANHO_LOTE_PAGINAS = 15; // páginas por lote: mantém memória/CPU de cada chamada limitadas.

// Garante o plano de lotes de páginas de um arquivo (idempotente — se já
// existir, é uma retomada e nada é recriado).
async function garantirPlanoLotes(supabase: any, casoId: string, arq: { id: string; storage_path: string; nome: string }) {
  const { data: existentes } = await supabase.from("lotes_contracheques").select("id").eq("arquivo_id", arq.id).limit(1);
  if(existentes && existentes.length) return;

  // Primeira vez processando este arquivo (não é retomada): remove
  // contracheques antigos SÓ dele, como um reprocessamento do zero faria —
  // sem afetar o que já foi gravado para os outros arquivos do caso.
  await supabase.from("contracheques").delete().eq("caso_id", casoId).eq("arquivo_origem", arq.nome);

  const { data: blob, error: de } = await supabase.storage.from("casos-arquivos").download(arq.storage_path);
  if(de || !blob) throw de ?? new Error(`Falha ao baixar ${arq.nome}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
  const totalPaginas = pdf.numPages;

  const { data: ultimoLote } = await supabase.from("lotes_contracheques").select("ordem").eq("caso_id", casoId).order("ordem", { ascending: false }).limit(1);
  let ordem = (ultimoLote?.[0]?.ordem ?? -1) + 1;

  const inserts = [];
  for(let inicio=1; inicio<=totalPaginas; inicio+=TAMANHO_LOTE_PAGINAS){
    const fim = Math.min(inicio+TAMANHO_LOTE_PAGINAS-1, totalPaginas);
    inserts.push({ caso_id: casoId, arquivo_id: arq.id, ordem: ordem++, pagina_inicio: inicio, pagina_fim: fim, status: "pendente" });
  }
  if(inserts.length){
    const { error: insErr } = await supabase.from("lotes_contracheques").insert(inserts);
    if(insErr) throw insErr;
  }
}

// Processa (ou retoma) os lotes de páginas de UM arquivo, gravando cada
// contracheque fechado assim que o lote que o concluiu termina. Devolve o
// total de contracheques do arquivo já persistidos (deste e de execuções
// anteriores). Lança se um lote falhar — os lotes já concluídos permanecem
// gravados e uma nova chamada retoma só o que falta.
async function processarArquivo(supabase: any, casoId: string, arq: { id: string; storage_path: string; nome: string }): Promise<number> {
  await garantirPlanoLotes(supabase, casoId, arq);

  const { data: lotes, error: lErr } = await supabase.from("lotes_contracheques").select("*").eq("arquivo_id", arq.id).order("ordem");
  if(lErr) throw lErr;
  if(!lotes || !lotes.length) return 0;

  // Semente do dedup + do total já persistido: o que já está gravado de
  // execuções anteriores (retomada) — nunca reconstruído a partir do PDF.
  const assinaturasVistas = new Set<string>();
  let fechadosTotal = 0;
  {
    const { data: existentes } = await supabase.from("contracheques")
      .select("competencia, total_proventos, total_descontos, itens_contracheque(codigo, valor)")
      .eq("caso_id", casoId).eq("arquivo_origem", arq.nome);
    for(const c of existentes ?? []){
      const itens = Array.isArray(c.itens_contracheque) ? c.itens_contracheque : [];
      assinaturasVistas.add(assinaturaContra({ competencia: c.competencia, total_proventos: c.total_proventos, total_descontos: c.total_descontos, itens }));
      fechadosTotal++;
    }
  }

  const ultimoLoteConcluido = [...lotes].reverse().find((l: any) => l.status === "concluido");
  let estado: Contra | null = (ultimoLoteConcluido?.estado_saida as Contra | null) ?? null;

  const pendentes = lotes.filter((l: any) => l.status !== "concluido");
  if(!pendentes.length) return fechadosTotal;

  const idUltimoLote = lotes[lotes.length-1].id;
  // Baixa e abre o PDF uma única vez para todos os lotes pendentes deste
  // arquivo (o custo caro é decodificar o CONTEÚDO de cada página, feito só
  // para as páginas do lote da vez — não a estrutura do documento).
  const { data: blob, error: de } = await supabase.storage.from("casos-arquivos").download(arq.storage_path);
  if(de || !blob) throw de ?? new Error(`Falha ao baixar ${arq.nome}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });

  for(const lote of pendentes){
    try{
      await supabase.from("lotes_contracheques").update({ status:"processando", erro:null, atualizado_em:new Date().toISOString() }).eq("id", lote.id);

      const itensPaginas = await extrairItensDoIntervalo(pdf, lote.pagina_inicio, lote.pagina_fim);
      // O conteúdo de texto não expõe a largura da página; usa o maior limite horizontal observado.
      const paginasContra = itensPaginas.map((itens) => parsePagina(itens as TextItem[], Math.max(...itens.map((x)=>x.x+x.width), 595)));

      const { fechados, aberto } = consolidarLote(paginasContra, estado);
      const ehUltimoLote = lote.id === idUltimoLote;
      const fecharAgora = ehUltimoLote && aberto ? [...fechados, aberto] : fechados;

      for(const c of fecharAgora){
        const assinatura = assinaturaContra(c);
        if(assinaturasVistas.has(assinatura)) continue;
        assinaturasVistas.add(assinatura);
        await persistirContra(supabase, casoId, c, arq.nome);
        fechadosTotal++;
      }
      estado = ehUltimoLote ? null : aberto;

      await supabase.from("lotes_contracheques").update({ status:"concluido", estado_saida: estado, erro:null, atualizado_em:new Date().toISOString() }).eq("id", lote.id);
    }catch(loteError){
      const msg = loteError instanceof Error ? loteError.message : String(loteError);
      await supabase.from("lotes_contracheques").update({ status:"erro", erro:msg, atualizado_em:new Date().toISOString() }).eq("id", lote.id);
      throw loteError;
    }
  }
  return fechadosTotal;
}

// Fallback de IA quando o passo determinístico não achou nada no arquivo
// (ex.: PDF é foto/scan sem camada de texto). Reaproveita os MESMOS lotes de
// páginas já planejados (marcando ia_status neles) em vez de mandar o arquivo
// inteiro numa única requisição — um PDF de dezenas de páginas em base64
// estoura o limite do gateway/da IA e derruba a função antes de responder.
// Uma chamada seguinte retoma só os lotes de IA que faltam.
async function processarArquivoComIa(supabase: any, casoId: string, arq: { id: string; storage_path: string; nome: string }, apiKey: string): Promise<{ total: number; erro: string | null }> {
  const { data: lotes, error: lErr } = await supabase.from("lotes_contracheques").select("*").eq("arquivo_id", arq.id).order("ordem");
  if(lErr) throw lErr;
  if(!lotes || !lotes.length) return { total: 0, erro: null };

  const aMarcar = lotes.filter((l: any) => l.ia_status == null);
  if(aMarcar.length){
    await supabase.from("lotes_contracheques").update({ ia_status: "pendente" }).in("id", aMarcar.map((l: any) => l.id));
    for(const l of aMarcar) l.ia_status = "pendente";
  }

  const pendentesIa = lotes.filter((l: any) => l.ia_status !== "concluido");
  if(!pendentesIa.length) return { total: 0, erro: null };

  // Mesma semente de dedup usada no passo determinístico: o que já está
  // gravado (deste arquivo, de lotes de IA concluídos antes) nunca é reinserido.
  const assinaturasVistas = new Set<string>();
  {
    const { data: existentes } = await supabase.from("contracheques")
      .select("competencia, total_proventos, total_descontos, itens_contracheque(codigo, valor)")
      .eq("caso_id", casoId).eq("arquivo_origem", arq.nome);
    for(const c of existentes ?? []){
      const itens = Array.isArray(c.itens_contracheque) ? c.itens_contracheque : [];
      assinaturasVistas.add(assinaturaContra({ competencia: c.competencia, total_proventos: c.total_proventos, total_descontos: c.total_descontos, itens }));
    }
  }

  const { data: blob, error: de } = await supabase.storage.from("casos-arquivos").download(arq.storage_path);
  if(de || !blob) throw de ?? new Error(`Falha ao baixar ${arq.nome}`);
  const bytesOriginal = new Uint8Array(await blob.arrayBuffer());

  let total = 0;
  let erroFatal: string | null = null;
  for(const lote of pendentesIa){
    try{
      const bytesLote = await fatiarPaginas(bytesOriginal, lote.pagina_inicio, lote.pagina_fim);
      const contrasIa = await extrairComIa(bytesLote, arq.nome, apiKey);
      for(const c of contrasIa){
        const assinatura = assinaturaContra(c);
        if(assinaturasVistas.has(assinatura)) continue;
        assinaturasVistas.add(assinatura);
        await persistirContra(supabase, casoId, c, arq.nome);
        total++;
      }
      await supabase.from("lotes_contracheques").update({ ia_status:"concluido", erro:null, atualizado_em:new Date().toISOString() }).eq("id", lote.id);
    }catch(iaError){
      const msg = iaError instanceof Error ? iaError.message : String(iaError);
      await supabase.from("lotes_contracheques").update({ ia_status:"erro", erro:msg, atualizado_em:new Date().toISOString() }).eq("id", lote.id);
      if(msg.includes("Créditos")){erroFatal=msg;break;} // esgotado: os demais lotes falhariam igual
    }
  }
  return { total, erro: erroFatal };
}

// ---------------- fluxo por LOTES FÍSICOS (um PDF por lote no Storage) ----------------
// Cada invocação lida com um único lote: nunca baixa nem percorre o PDF
// consolidado inteiro, o que eliminava o timeout em conjuntos grandes.

const PREFIXO_LOTES = (casoId: string) => `${casoId}/contracheques-lotes/`;

// Semente de dedup: assinaturas do que já está gravado para este arquivo.
async function assinaturasExistentes(supabase: any, casoId: string, arquivoNome: string): Promise<Set<string>> {
  const vistos = new Set<string>();
  const { data: existentes } = await supabase.from("contracheques")
    .select("competencia, total_proventos, total_descontos, itens_contracheque(codigo, valor)")
    .eq("caso_id", casoId).eq("arquivo_origem", arquivoNome);
  for(const c of existentes ?? []){
    const itens = Array.isArray(c.itens_contracheque) ? c.itens_contracheque : [];
    vistos.add(assinaturaContra({ competencia: c.competencia, total_proventos: c.total_proventos, total_descontos: c.total_descontos, itens }));
  }
  return vistos;
}

// Cria (idempotentemente) os registros de lote apontando ao PDF físico já
// enviado pelo cliente. Não cria registros em `arquivos`.
async function planejarLotes(supabase: any, casoId: string, lotes: any[]) {
  if(!Array.isArray(lotes) || !lotes.length) throw new Error("lotes obrigatórios");

  const { data: arquivos, error: ae } = await supabase.from("arquivos")
    .select("id,nome,storage_path").eq("caso_id", casoId).eq("tipo", "contracheque").order("created_at");
  if(ae) throw ae;
  const arquivo = (arquivos ?? [])[0];
  if(!arquivo) throw new Error("Arquivo de contracheques não encontrado");

  const { data: jaPlanejados } = await supabase.from("lotes_contracheques")
    .select("id,ordem,pagina_inicio,pagina_fim,status,storage_path")
    .eq("caso_id", casoId).not("storage_path", "is", null).order("ordem");
  if(jaPlanejados && jaPlanejados.length) return { lotes: jaPlanejados, arquivo_nome: arquivo.nome };

  const prefixo = PREFIXO_LOTES(casoId);
  const inserts = lotes.map((l: any, indice: number) => {
    const storagePath = String(l.storage_path ?? "");
    if(!storagePath.startsWith(prefixo)) throw new Error(`storage_path inválido para o lote ${indice + 1}`);
    const inicio = Number(l.pagina_inicio), fim = Number(l.pagina_fim);
    if(!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 1 || fim < inicio) throw new Error(`intervalo inválido no lote ${indice + 1}`);
    if(fim - inicio + 1 > TAMANHO_LOTE_PAGINAS) throw new Error(`lote ${indice + 1} excede ${TAMANHO_LOTE_PAGINAS} páginas`);
    return {
      caso_id: casoId, arquivo_id: arquivo.id,
      ordem: Number.isInteger(Number(l.ordem)) ? Number(l.ordem) : indice,
      pagina_inicio: inicio, pagina_fim: fim, status: "pendente", storage_path: storagePath,
    };
  });

  // Primeiro planejamento deste arquivo: limpa contracheques anteriores dele.
  await supabase.from("contracheques").delete().eq("caso_id", casoId).eq("arquivo_origem", arquivo.nome);

  const { data: criados, error: ie } = await supabase.from("lotes_contracheques")
    .insert(inserts).select("id,ordem,pagina_inicio,pagina_fim,status,storage_path");
  if(ie) throw ie;
  return { lotes: (criados ?? []).sort((a: any, b: any) => a.ordem - b.ordem), arquivo_nome: arquivo.nome };
}

// Processa UM lote físico por invocação. Exige o lote anterior concluído para
// que `estado_saida` (contracheque continuado entre lotes) seja preservado.
async function processarLoteFisico(supabase: any, casoId: string, loteId: string) {
  const { data: lote, error: le } = await supabase.from("lotes_contracheques").select("*").eq("id", loteId).eq("caso_id", casoId).single();
  if(le || !lote) throw le ?? new Error("Lote não encontrado");
  if(!lote.storage_path) throw new Error("Lote sem arquivo físico");
  if(lote.status === "concluido") return { ok: true, contracheques: 0, ja_concluido: true };

  const { data: lotesCaso, error: lce } = await supabase.from("lotes_contracheques")
    .select("id,ordem,status,estado_saida").eq("caso_id", casoId).not("storage_path", "is", null).order("ordem");
  if(lce) throw lce;
  const indice = (lotesCaso ?? []).findIndex((l: any) => l.id === lote.id);
  const anterior = indice > 0 ? lotesCaso[indice - 1] : null;
  if(anterior && anterior.status !== "concluido") throw new Error("O lote anterior ainda não foi concluído");
  const ehUltimoLote = indice === (lotesCaso ?? []).length - 1;

  const { data: arquivo } = await supabase.from("arquivos").select("nome").eq("id", lote.arquivo_id).single();
  const arquivoNome = arquivo?.nome ?? "contracheques-unificados.pdf";

  await supabase.from("lotes_contracheques").update({ status:"processando", erro:null, atualizado_em:new Date().toISOString() }).eq("id", lote.id);

  try{
    const { data: blob, error: de } = await supabase.storage.from("casos-arquivos").download(lote.storage_path);
    if(de || !blob) throw de ?? new Error(`Falha ao baixar o lote ${lote.ordem + 1}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });

    const itensPaginas = await extrairItensDoIntervalo(pdf, 1, pdf.numPages);
    const paginasContra = itensPaginas.map((itens) => parsePagina(itens as TextItem[], Math.max(...itens.map((x)=>x.x+x.width), 595)));

    const assinaturasVistas = await assinaturasExistentes(supabase, casoId, arquivoNome);
    const estadoEntrada = (anterior?.estado_saida as Contra | null) ?? null;

    const temDados = paginasContra.some((p) => p.itens.length || p.total_proventos != null);
    let total = 0;
    let estadoSaida: Contra | null = null;
    let usouIa = false;

    if(temDados){
      const { fechados, aberto } = consolidarLote(paginasContra, estadoEntrada);
      const fecharAgora = ehUltimoLote && aberto ? [...fechados, aberto] : fechados;
      for(const c of fecharAgora){
        const assinatura = assinaturaContra(c);
        if(assinaturasVistas.has(assinatura)) continue;
        assinaturasVistas.add(assinatura);
        await persistirContra(supabase, casoId, c, arquivoNome);
        total++;
      }
      estadoSaida = ehUltimoLote ? null : aberto;
    } else {
      // Sem camada de texto/dados NESTE lote: fallback de IA só para ele.
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if(!apiKey) throw new Error("pdf_sem_texto_estruturado");
      usouIa = true;
      const contrasIa = await extrairComIa(bytes, arquivoNome, apiKey);
      for(const c of contrasIa){
        const assinatura = assinaturaContra(c);
        if(assinaturasVistas.has(assinatura)) continue;
        assinaturasVistas.add(assinatura);
        await persistirContra(supabase, casoId, c, arquivoNome);
        total++;
      }
      estadoSaida = estadoEntrada; // a IA fecha por competência; propaga o estado recebido
    }

    await supabase.from("lotes_contracheques").update({
      status:"concluido", estado_saida: estadoSaida, ia_status: usouIa ? "concluido" : null,
      erro:null, atualizado_em:new Date().toISOString(),
    }).eq("id", lote.id);

    return { ok: true, contracheques: total, ordem: lote.ordem, usou_ia: usouIa };
  }catch(erro){
    const msg = erro instanceof Error ? erro.message : String(erro);
    await supabase.from("lotes_contracheques").update({ status:"erro", erro:msg, atualizado_em:new Date().toISOString() }).eq("id", lote.id);
    throw erro;
  }
}


Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
  try{
    const auth=req.headers.get("Authorization");if(!auth)return json({error:"Não autenticado"},401);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:{user},error:authError}=await supabase.auth.getUser(auth.replace(/^Bearer\s+/i,""));
    if(authError||!user)return json({error:"Não autenticado"},401);
    const body=await req.json();
    const {caso_id}=body;if(!caso_id)return json({error:"caso_id obrigatório"},400);

    // Modo progress: estado dos lotes de páginas para a tela de acompanhamento.
    if(body.progress){
      const {data}=await supabase.from("lotes_contracheques").select("id,ordem,pagina_inicio,pagina_fim,status,erro,atualizado_em").eq("caso_id",caso_id).order("ordem");
      return json({lotes:data??[]});
    }

    const {data:arquivos,error}=await supabase.from("arquivos").select("id,nome,storage_path,mime_type").eq("caso_id",caso_id).eq("tipo","contracheque");if(error)throw error;

    const revisao:Array<{arquivo:string;motivo:string}>=[];
    let arquivosComIa=0, totalFechados=0;
    for(const arq of arquivos??[]){
      if(arq.mime_type!=="application/pdf"){revisao.push({arquivo:arq.nome,motivo:"formato_nao_pdf"});continue;}
      try{
        const fechadosArquivo=await processarArquivo(supabase,caso_id,arq);
        totalFechados+=fechadosArquivo;
        if(fechadosArquivo===0){
          const apiKey=Deno.env.get("LOVABLE_API_KEY");
          if(!apiKey){revisao.push({arquivo:arq.nome,motivo:"pdf_sem_texto_estruturado"});continue;}
          try{
            const {total:totalIa,erro:erroIa}=await processarArquivoComIa(supabase,caso_id,arq,apiKey);
            totalFechados+=totalIa;
            if(totalIa>0)arquivosComIa++;
            if(erroIa)revisao.push({arquivo:arq.nome,motivo:erroIa});
            else if(totalIa===0)revisao.push({arquivo:arq.nome,motivo:"pdf_sem_texto_estruturado"});
          }catch(fallbackError){
            revisao.push({arquivo:arq.nome,motivo:fallbackError instanceof Error?fallbackError.message:"falha_na_ia"});
          }
        }
      }catch(arquivoError){
        revisao.push({arquivo:arq.nome,motivo:arquivoError instanceof Error?arquivoError.message:"falha_no_processamento"});
      }
    }
    return json({ok:true,contracheques:totalFechados,arquivos_processados_com_ia:arquivosComIa,revisao});
  }catch(e){
    const detalhe=e instanceof Error
      ? {name:e.name,message:e.message,stack:e.stack}
      : {message:String(e)};
    console.error("process-contracheques-pdf error",detalhe);
    return json({error:e instanceof Error?e.message:"Erro ao processar contracheques"},500);
  }
});
