import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getDocumentProxy } from "npm:unpdf@1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
type TextItem = { str: string; x: number; y: number; width: number; height: number };
type Tipo = "provento" | "desconto" | "informativo";
type Rubrica = { codigo: string; descricao: string; referencia: number | null; valor: number; tipo: Tipo; familia_hra: string | null };
type Contra = { competencia: string | null; modelo_origem: string; total_proventos: number | null; total_descontos: number | null; liquido: number | null; itens: Rubrica[] };
type Linha = { y: number; itens: TextItem[]; texto: string };
const CODIGO = /^\/?[A-Z0-9]{3,6}$/i;
const VALOR = /^-?(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}$|^-?(?:R\$)?\s*\d+,\d{2}$/i;
const MESES: Record<string, string> = { janeiro:"01",fevereiro:"02",marco:"03",abril:"04",maio:"05",junho:"06",julho:"07",agosto:"08",setembro:"09",outubro:"10",novembro:"11",dezembro:"12",jan:"01",fev:"02",mar:"03",abr:"04",mai:"05",jun:"06",jul:"07",ago:"08",set:"09",out:"10",nov:"11",dez:"12" };
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const moeda = (s: string) => Number(s.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;

async function extrairItensPorPagina(pdf: Awaited<ReturnType<typeof getDocumentProxy>>) {
  const paginas: TextItem[][] = [];
  for (let numero = 1; numero <= pdf.numPages; numero++) {
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
  const m=n.match(/(?:mes\/ano|competencia|referencia)?\s*[:-]?\s*(0[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})/i);
  if(m)return `${m[1]}/${m[2]}`;
  for(const [nome,numero] of Object.entries(MESES)){
    const separado=n.match(new RegExp(`\\b${nome}[/.-](20\\d{2})\\b`));if(separado)return `${numero}/${separado[1]}`;
    const a=n.match(new RegExp(`\\b${nome}\\s+(20\\d{2})\\b`)); if(a)return `${numero}/${a[1]}`;
    const b=n.match(new RegExp(`\\d{1,2}[/-]${nome}[/-](20\\d{2})`)); if(b)return `${numero}/${b[1]}`;
  }
  return null;
}

function familia(descricao: string) {
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
    rubricas.push({codigo:cod?.str.trim().toUpperCase()??"",descricao,referencia,valor:Math.abs(moeda(vi.str)),tipo,familia_hra:familia(descricao)});
  }
  if(!/\bcontinua\b/.test(norm(texto))){
    total_proventos??=rubricas.filter((i)=>i.tipo==="provento").reduce((s,i)=>s+i.valor,0)||null;
    total_descontos??=rubricas.filter((i)=>i.tipo==="desconto").reduce((s,i)=>s+i.valor,0)||null;
    liquido??=total_proventos!=null&&total_descontos!=null?total_proventos-total_descontos:null;
  }
  return{competencia:competencia(texto),modelo_origem,total_proventos,total_descontos,liquido,itens:rubricas};
}

function consolidar(paginas:Contra[]) {
  const out:Contra[]=[]; let atual:Contra|null=null;
  for(const p of paginas){
    if(!p.itens.length&&p.total_proventos==null)continue;
    const continuaElekeiroz=atual?.modelo_origem==="elekeiroz"&&p.modelo_origem==="elekeiroz"&&atual.competencia===p.competencia;
    if(!atual||(!continuaElekeiroz&&atual.total_proventos!=null&&atual.total_descontos!=null)){atual={...p,itens:[...p.itens]};out.push(atual);}
    else{atual.itens.push(...p.itens);if(p.total_proventos!=null)atual.total_proventos=p.total_proventos;if(p.total_descontos!=null)atual.total_descontos=p.total_descontos;if(p.liquido!=null)atual.liquido=p.liquido;}
  }
  const vistos=new Set<string>();
  return out.filter((c)=>{const k=`${c.competencia}|${c.total_proventos}|${c.total_descontos}|${c.itens.map((i)=>`${i.codigo}:${i.valor}`).join(",")}`;if(vistos.has(k))return false;vistos.add(k);return true;});
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
  try{
    const auth=req.headers.get("Authorization");if(!auth)return json({error:"Não autenticado"},401);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:claims,error:authError}=await supabase.auth.getClaims(auth.replace(/^Bearer\s+/i,""));
    if(authError||!claims?.claims?.sub)return json({error:"Não autenticado"},401);
    const {caso_id}=await req.json();if(!caso_id)return json({error:"caso_id obrigatório"},400);
    const {data:arquivos,error}=await supabase.from("arquivos").select("nome,storage_path,mime_type").eq("caso_id",caso_id).eq("tipo","contracheque");if(error)throw error;
    const extraidos:Array<Contra&{arquivo_origem:string}>=[],revisao=[];
    for(const arq of arquivos??[]){
      if(arq.mime_type!=="application/pdf"){revisao.push({arquivo:arq.nome,motivo:"formato_nao_pdf"});continue;}
      const {data:blob,error:de}=await supabase.storage.from("casos-arquivos").download(arq.storage_path);if(de||!blob)throw de??new Error(`Falha ao baixar ${arq.nome}`);
      const pdf=await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()),{maxImageSize:16_777_216});if(pdf.numPages>100){revisao.push({arquivo:arq.nome,motivo:"limite_de_paginas"});continue;}
      const items=await extrairItensPorPagina(pdf);
      // O conteúdo de texto não expõe a largura da página; usa o maior limite horizontal observado.
      const paginas=items.map((pagina)=>parsePagina(pagina as TextItem[],Math.max(...pagina.map((x)=>x.x+x.width),595)));
      const contras=consolidar(paginas);
      if(!contras.length){revisao.push({arquivo:arq.nome,motivo:"pdf_sem_texto_estruturado"});continue;}
      extraidos.push(...contras.map((c)=>({...c,arquivo_origem:arq.nome})));
    }
    if(extraidos.length){
      await supabase.from("contracheques").delete().eq("caso_id",caso_id);
      for(const c of extraidos){
        const {data:row,error:ie}=await supabase.from("contracheques").insert({caso_id,competencia:c.competencia,total_proventos:c.total_proventos,total_descontos:c.total_descontos,liquido:c.liquido,arquivo_origem:c.arquivo_origem,modelo_origem:c.modelo_origem}).select("id").single();if(ie)throw ie;
        const {error:itemError}=await supabase.from("itens_contracheque").insert(c.itens.map(({familia_hra,...i})=>({...i,familia_hra,contracheque_id:row.id})));if(itemError)throw itemError;
      }
    }
    return json({ok:true,contracheques:extraidos.length,revisao});
  }catch(e){return json({error:e instanceof Error?e.message:"Erro ao processar contracheques"},500);}
});
