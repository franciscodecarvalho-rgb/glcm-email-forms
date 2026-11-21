import { linhasDaPagina, moedaBrasileiraParaNumero, type TextItemPdf } from "./parse-contracheque-pdf";
import { CAIXAS_TOTAIS_MATARIPE, ehRodapeMataripe, LIMITE_VENCIMENTOS_MATARIPE } from "./perfis-contracheque";

type Tela = HTMLCanvasElement | OffscreenCanvas;
type Item = TextItemPdf & { confianca: number };
type FaixaMataripe = "codigo" | "provento" | "desconto";

const VALOR_MATARIPE = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\]?$/;
const CODIGO_MATARIPE = /^\|?(\d{4})(?=$|\D|\d+\/\d)(.*)$/;

const FAIXAS: { campo: FaixaMataripe; esquerda: number; direita: number }[] = [
  { campo: "codigo", esquerda: .056, direita: .095 },
  { campo: "provento", esquerda: .615, direita: .769 },
  { campo: "desconto", esquerda: LIMITE_VENCIMENTOS_MATARIPE, direita: .957 },
];

function tabelaMataripe(itens: TextItemPdf[]) {
  const linhas = linhasDaPagina(itens);
  const inicio = linhas.findIndex((linha) => /vencimentos.*descontos/i.test(linha.texto));
  if (inicio < 0) return null;
  const fim = linhas.findIndex((linha, i) => i > inicio && ehRodapeMataripe(linha.texto));
  if (fim < 0) return null;
  const alturaRodape = linhas[fim].y;
  const totais = linhas.slice(fim, fim + 4).filter((linha) => alturaRodape - linha.y <= 22);
  return { cabecalho: linhas[inicio], rodape: linhas[fim], corpo: linhas.slice(inicio + 1, fim), totais };
}
const emCentavos = (texto: string) => Math.round(Math.abs(moedaBrasileiraParaNumero(texto)) * 100);
const valorLegivel = (item: TextItemPdf) => VALOR_MATARIPE.test(item.str.trim());

function valoresPorQuadroMataripe<T extends TextItemPdf>(itens: T[], largura: number): (T | null)[] {
  return CAIXAS_TOTAIS_MATARIPE.map(([inicio, fim]) => {
    const valores = itens.filter((item) => valorLegivel(item) && item.x >= largura * inicio && item.x < largura * fim);
    return new Set(valores.map((item) => emCentavos(item.str))).size === 1 ? valores[0] : null;
  });
}

// Triagem local para evitar repetir OCR quando a primeira leitura está íntegra.
// O servidor volta a conferir a identidade, as rubricas e os totais do PDF.
export function leituraMataripeReconcilia(itens: TextItemPdf[], largura: number): boolean {
  const tabela = tabelaMataripe(itens);
  if (!tabela) return false;
  const [proventos, descontos, liquido] = valoresPorQuadroMataripe(
    tabela.totais.flatMap((linha) => linha.itens), largura,
  ).map((item) => item && emCentavos(item.str));
  if (proventos == null || descontos == null || liquido == null) return false;
  const faixaValor = largura * FAIXAS[1].esquerda;
  const limiteDesconto = largura * FAIXAS[2].esquerda;
  const somas = [0, 0];
  let emBases = false;
  for (const linha of tabela.corpo) {
    if (/base\s*\/\s*outros/i.test(linha.texto)) emBases = true;
    const valores = linha.itens.filter((item) => item.x >= faixaValor && valorLegivel(item));
    if (!valores.length) {
      if (linha.itens.some((item) => item.x >= faixaValor && /\d/.test(item.str) && /[.,]/.test(item.str))) return false;
      continue;
    }
    if (valores.length !== 1 || !linha.itens.some((item) => item.x < largura * .11 && CODIGO_MATARIPE.test(item.str.trim()))) {
      return false;
    }
    if (!emBases) somas[valores[0].x < limiteDesconto ? 0 : 1] += emCentavos(valores[0].str);
  }
  return Math.abs(somas[0] - proventos) <= 5
    && Math.abs(somas[1] - descontos) <= 5
    && Math.abs(proventos - descontos - liquido) <= 5;
}

// Limpa somente as linhas verticais dominantes nas três regiões da grade ADP,
// na cópia enviada ao OCR. A imagem original do PDF é preservada.
export function limparGradeOcrMataripe(tela: Tela, escala: number): void {
  const contexto = tela.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!contexto) return;
  const { width, height } = tela;
  const topo = Math.floor(height * .18);
  const rodape = Math.floor(height * .70);
  const imagem = contexto.getImageData(0, topo, width, rodape - topo);
  const margem = Math.round(escala * 10 / 3);
  const minimoPixelsEscuros = Math.round(escala * 160 / 3);
  for (const proporcao of [.507, .594, .771]) {
    const centro = Math.round(width * proporcao);
    let ponto = centro;
    let maiorContagem = 0;
    for (let x = centro - margem; x <= centro + margem; x++) {
      let escuros = 0;
      for (let y = 0; y < imagem.height; y++) {
        if (imagem.data[(y * width + x) * 4] < 216) escuros++;
      }
      if (escuros > maiorContagem) {
        maiorContagem = escuros;
        ponto = x;
      }
    }
    if (maiorContagem < minimoPixelsEscuros) continue;
    contexto.fillStyle = "#fff";
    contexto.fillRect(ponto - 2, topo, 5, rodape - topo);
  }
}

type NumeroLido = { campo: FaixaMataripe; item: Item };

function numeroDaFaixa(campo: FaixaMataripe, item: Item): Item | null {
  if (campo !== "codigo") return valorLegivel(item) ? item : null;
  // No recorte da primeira coluna sobra às vezes um traço da descrição.
  // Aceita quatro dígitos completos e descarta só a pontuação terminal.
  const texto = item.str.trim();
  const codigo = texto.match(/^(\d{4})[,.]?$/)?.[1];
  return codigo ? { ...item, str: codigo, width: item.width * codigo.length / texto.length } : null;
}

// Troca apenas tokens que ocupam a mesma célula. Um prefixo colado ao texto
// pode ser removido sem descartar o sufixo da descrição original.
export function mesclarNumerosOcrMataripe(original: Item[], releitura: NumeroLido[], largura: number): Item[] {
  let itens = original;
  for (const { campo, item } of releitura) {
    const faixa = FAIXAS.find((candidata) => candidata.campo === campo);
    const teto = campo === "codigo" ? item.x + item.width * .96 : faixa.direita * largura;
    const piso = faixa.esquerda * largura - 3;
    itens = itens.flatMap((atual) => {
      if (Math.abs(atual.y - item.y) >= 3.1 || atual.x < piso || atual.x >= teto || atual.str === "|") return [atual];
      const sufixo = campo === "codigo" ? atual.str.match(CODIGO_MATARIPE)?.[2]?.trim() : null;
      if (!sufixo || sufixo === "|") return [];
      return [{ ...atual, str: sufixo, x: item.x + item.width, width: Math.max(4, atual.width - item.width) }];
    });
    itens.push(item);
  }
  return itens;
}
export async function relerFaixasOcrMataripe(
  tela: Tela,
  itens: Item[],
  escala: number,
  criarCanvas: (largura: number, altura: number) => Tela,
  reconhecerNumeros: (recorte: Tela) => Promise<Item[]>,
): Promise<Item[]> {
  const tabela = tabelaMataripe(itens);
  if (!tabela) return itens;
  const { width, height } = tela;
  const y0 = Math.max(0, Math.floor(height - (tabela.cabecalho.y - 4) * escala));
  const y1 = Math.min(height, Math.ceil(height - (tabela.rodape.y + 3) * escala));
  if (y1 <= y0) return itens;

  const novos: NumeroLido[] = [];
  const margem = 15;
  for (const faixa of FAIXAS) {
    const x0 = Math.floor(width * faixa.esquerda);
    const w = Math.ceil(width * faixa.direita) - x0;
    const h = y1 - y0;
    const recorte = criarCanvas(w + 2 * margem, h + 2 * margem);
    const contexto = recorte.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!contexto) return itens;
    contexto.fillStyle = "#fff";
    contexto.fillRect(0, 0, recorte.width, recorte.height);
    contexto.drawImage(tela, x0, y0, w, h, margem, margem, w, h);
    const resultado = await reconhecerNumeros(recorte);
    for (const item of resultado) {
      const numero = numeroDaFaixa(faixa.campo, item);
      if (numero) novos.push({
        campo: faixa.campo,
        item: { ...numero, x: numero.x + (x0 - margem) / escala, y: numero.y + (height - y1 - margem) / escala },
      });
    }
  }
  return novos.length ? mesclarNumerosOcrMataripe(itens, novos, width / escala) : itens;
}

type CelulaIlegivel = { faixa: typeof FAIXAS[number]; y: number };

function celulasIlegiveisMataripe(itens: Item[], largura: number): CelulaIlegivel[] {
  const tabela = tabelaMataripe(itens);
  if (!tabela) return [];
  const celulas: CelulaIlegivel[] = [];
  for (const linha of tabela.corpo) {
    const campos = FAIXAS.map((faixa) => linha.itens.filter((item) =>
      item.x >= faixa.esquerda * largura && item.x < faixa.direita * largura));
    const [codigos, proventos, descontos] = campos;
    const temCodigo = linha.itens.some((item) => item.x < largura * .11 && CODIGO_MATARIPE.test(item.str.trim()));
    const valor = [...proventos, ...descontos].find((item) => /\d/.test(item.str));
    if (!temCodigo && valor) {
      // O valor localiza a linha mesmo quando o OCR some com todo o código.
      celulas.push({ faixa: FAIXAS[0], y: valor.y });
    }
    if (!temCodigo && !codigos.length) continue;
    for (const [i, valores] of [proventos, descontos].entries()) {
      if (!valores.some(valorLegivel)) {
        const incompleto = valores.find((item) => /\d/.test(item.str));
        if (incompleto) celulas.push({ faixa: FAIXAS[i + 1], y: incompleto.y });
      }
    }
  }
  return celulas;
}

type CriarTela = (largura: number, altura: number) => Tela;
type LerNumeros = (recorte: Tela, escalaRecorte: number) => Promise<Item[]>;
type RenderizarTela = (escala: number) => Promise<Tela>;

async function lerLinhaNumericaMataripe(
  tela: Tela, escala: number, y: number, esquerda: number, direita: number,
  criarCanvas: CriarTela, ler: LerNumeros, meiaAltura = 4.2, zoom = 2,
): Promise<Item[]> {
  const margem = 15;
  const x0 = Math.floor(tela.width * esquerda);
  const w = Math.ceil(tela.width * direita) - x0;
  const y0 = Math.max(0, Math.floor(tela.height - (y + meiaAltura) * escala));
  const y1 = Math.min(tela.height, Math.ceil(tela.height - (y - meiaAltura) * escala));
  const h = y1 - y0;
  if (h <= 0) return [];
  const recorte = criarCanvas(w * zoom + 2 * margem, h * zoom + 2 * margem);
  const contexto = recorte.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!contexto) return [];
  contexto.fillStyle = "#fff";
  contexto.fillRect(0, 0, recorte.width, recorte.height);
  contexto.imageSmoothingEnabled = false;
  contexto.drawImage(tela, x0, y0, w, h, margem, margem, w * zoom, h * zoom);
  const escalaRecorte = escala * zoom;
  return (await ler(recorte, escalaRecorte)).map((item) =>
    ({ ...item, x: item.x + x0 / escala - margem / escalaRecorte, y }));
}

// O OCR por coluna ainda pode perder uma célula. Nesses casos, amplie só a
// linha que já tem evidência visual, preservando a posição e o tipo de campo.
export async function relerCelulasOcrMataripe(
  tela: Tela,
  itens: Item[],
  escala: number,
  criarCanvas: (largura: number, altura: number) => Tela,
  reconhecerNumeros: (recorte: Tela, escalaRecorte: number) => Promise<Item[]>,
): Promise<Item[]> {
  const novos: NumeroLido[] = [];
  const largura = tela.width / escala;
  for (const { faixa, y } of celulasIlegiveisMataripe(itens, largura).slice(0, 6)) {
    const lerCelula = async (direita: number, centro = y) => {
      const lidos = await lerLinhaNumericaMataripe(tela, escala, centro, faixa.esquerda, direita, criarCanvas, reconhecerNumeros);
      return lidos.map((item) => numeroDaFaixa(faixa.campo, item))
        .filter((item): item is Item => item !== null);
    };
    let numeros = await lerCelula(faixa.direita);
    if (numeros.length !== 1) {
      // A caixa do OCR pode subir em relação aos dígitos impressos.
      numeros = await lerCelula(faixa.direita, y - 1.2);
    }
    if (faixa.campo === "codigo" && numeros.length !== 1) {
      // Códigos estreitos podem ficar colados à primeira letra da descrição.
      numeros = await lerCelula(.092, y - 1.2);
    }
    if (numeros.length === 1) novos.push({ campo: faixa.campo, item: numeros[0] });
  }
  return novos.length ? mesclarNumerosOcrMataripe(itens, novos, largura) : itens;
}

function tokenRodapeMataripe(item: TextItemPdf, largura: number): boolean {
  return item.x >= CAIXAS_TOTAIS_MATARIPE[0][0] * largura && item.x < CAIXAS_TOTAIS_MATARIPE[2][1] * largura
    && /\d/.test(item.str);
}

function linhaTotaisMataripe(itens: Item[], largura: number) {
  const tabela = tabelaMataripe(itens);
  const tokens = tabela?.totais.flatMap((linha) => linha.itens)
    .filter((item) => tokenRodapeMataripe(item, largura)) as Item[] | undefined;
  if (!tokens || tokens.length < 2) return null;
  const ys = tokens.map((item) => item.y).sort((a, b) => a - b);
  return { valores: valoresPorQuadroMataripe(tokens, largura), y: ys[Math.floor(ys.length / 2)] };
}

function substituirTotaisMataripe(itens: Item[], valores: Item[], largura: number, y: number): Item[] {
  const preservados = itens.filter((item) => Math.abs(item.y - y) >= 4.2 || !tokenRodapeMataripe(item, largura));
  return [...preservados, ...valores.map((item) => ({ ...item, y }))];
}

// BASE/OUTROS não participa dos totais. Confirma o valor no recorte da célula
// e usa outra resolução só se houver divergência ou se a célula não for lida.
export async function conferirValoresInformativosMataripe(
  itens: Item[],
  telaInicial: Tela,
  escalaInicial: number,
  renderizar: RenderizarTela,
  criarCanvas: CriarTela,
  ler: LerNumeros,
): Promise<Item[]> {
  const largura = telaInicial.width / escalaInicial;
  const corpo = tabelaMataripe(itens)?.corpo ?? [];
  const inicioBases = corpo.findIndex((linha) => /base\s*\/\s*outros/i.test(linha.texto));
  if (inicioBases < 0) return itens;
  const valores = corpo.slice(inicioBases + 1).flatMap((linha) =>
    linha.itens.filter((item) => item.x >= largura * .795 && valorLegivel(item)));
  const telas = new Map([[escalaInicial, Promise.resolve(telaInicial)]]);
  const lerValor = async (valor: TextItemPdf, escala: number, esquerda: number, deslocamento: number, altura: number, zoom = 2): Promise<Item | null> => {
    if (!telas.has(escala)) telas.set(escala, renderizar(escala));
    const tela = await telas.get(escala)!;
    const lidos = (await lerLinhaNumericaMataripe(
      tela, escala, valor.y + deslocamento, esquerda, .949, criarCanvas, ler, altura, zoom,
    )).filter(valorLegivel);
    return lidos.length === 1 ? lidos[0] : null;
  };
  const iguais = (a: TextItemPdf, b: TextItemPdf | null) => b !== null && emCentavos(a.str) === emCentavos(b.str);
  const confirmarAmpliado = async (valor: TextItemPdf) => {
    const largo = Math.max(.795, Math.min(.85, valor.x / largura - .03));
    const estreito = Math.max(.795, Math.min(.86, valor.x / largura - .018));
    const confirmados = new Map<number, { texto: string; leituras: number }>();
    for (const [esquerda, deslocamento] of [[largo, 0], [estreito, -1], [estreito, 1]]) {
      const tres = await lerValor(valor, 3, esquerda, deslocamento, 5.2);
      const quatro = await lerValor(valor, 4, esquerda, deslocamento, 5.2);
      if (iguais(valor, tres) || iguais(valor, quatro)) return valor.str;
      if (!tres || !iguais(tres, quatro)) continue;
      const quantia = emCentavos(tres.str);
      const leituras = (confirmados.get(quantia)?.leituras ?? 0) + 1;
      confirmados.set(quantia, { texto: tres.str, leituras });
    }
    const opcoes = [...confirmados.values()].filter((opcao) => opcao.leituras >= 2);
    // O mesmo enquadramento pode induzir o mesmo erro em duas escalas.
    if (opcoes.length === 1) return opcoes[0].texto;

    // A ampliação pode deformar algarismos que estão legíveis no raster original.
    const nativo = await lerValor(valor, escalaInicial, estreito, -1, 5.2, 1);
    return iguais(valor, nativo) ? valor.str : null;
  };
  const revisados = new Map<TextItemPdf, string>();
  for (const valor of valores) {
    if (iguais(valor, await lerValor(valor, escalaInicial, .795, 0, 4.2))) continue;
    const texto = await confirmarAmpliado(valor) ?? `${valor.str}?`;
    if (texto !== valor.str) revisados.set(valor, texto);
  }
  return revisados.size ? itens.map((item) => {
    const texto = revisados.get(item);
    return texto ? { ...item, str: texto } : item;
  }) : itens;
}

// Uma nova leitura do corpo pode perder um rodapé que já estava legível.
// Só reaproveita os três valores íntegros de outra leitura da mesma página.
export function recuperarTotaisMataripe(itens: Item[], outraLeitura: Item[], largura: number): Item[] {
  const destino = linhaTotaisMataripe(itens, largura);
  const origem = linhaTotaisMataripe(outraLeitura, largura);
  if (!destino || !origem) return itens;
  const valores = origem.valores.filter((item): item is Item => item !== null);
  if (valores.length !== 3) return itens;
  const [proventos, descontos, liquido] = valores.map((item) => emCentavos(item.str));
  if (Math.abs(proventos - descontos - liquido) > 5) return itens;
  return substituirTotaisMataripe(itens, valores, largura, destino.y);
}

// A soma das rubricas serve apenas para validar os valores lidos do rodapé.
// Cada tentativa relê os três campos no próprio quadro.
export async function relerTotaisOcrMataripe(
  tela: Tela,
  itens: Item[],
  escala: number,
  criarCanvas: CriarTela,
  ler: LerNumeros,
): Promise<Item[]> {
  const largura = tela.width / escala;
  const linha = linhaTotaisMataripe(itens, largura);
  if (!linha) return itens;

  // Para um único campo perdido, testa as leituras do próprio quadro. Os
  // outros dois valores só são reaproveitados se a folha inteira reconciliar.
  const camposPendentes = linha.valores.flatMap((item, indice) => item === null ? [indice] : []);
  if (camposPendentes.length === 1) {
    const indice = camposPendentes[0];
    const [inicio, fim] = CAIXAS_TOTAIS_MATARIPE[indice];
    const recortes = indice === 2
      // O líquido é alinhado à direita. Exclui a borda que o OCR pode ler
      // como dígito e mantém o quadro inteiro como alternativa.
      ? [[.85, .944, 5.2], [inicio, fim, 4.2]]
      : [[inicio, fim, 4.2]];
    for (const [esquerda, direita, meiaAltura] of recortes) {
      for (const deslocamento of [0, -1.2, 1.2]) {
        const candidatos = (await lerLinhaNumericaMataripe(
          tela, escala, linha.y + deslocamento, esquerda, direita, criarCanvas, ler, meiaAltura,
        )).filter(valorLegivel);
        if (candidatos.length !== 1) continue;
        const valores = linha.valores.map((item) => item ?? candidatos[0]);
        const candidata = substituirTotaisMataripe(itens, valores, largura, linha.y);
        if (leituraMataripeReconcilia(candidata, largura)) return candidata;
      }
    }
  }

  // Diferentes renderizadores podem deslocar a caixa reconhecida em relação
  // aos algarismos. Testa a faixa vizinha sem ampliar o recorte sobre a grade.
  for (const deslocamento of [0, 1.8, -1.8]) {
    const valores: Item[] = [];
    for (const [esquerda, direita] of CAIXAS_TOTAIS_MATARIPE) {
      const candidatos = (await lerLinhaNumericaMataripe(
        tela, escala, linha.y + deslocamento, esquerda, direita, criarCanvas, ler,
      )).filter(valorLegivel);
      if (candidatos.length !== 1) break;
      valores.push(candidatos[0]);
    }
    if (valores.length !== 3) continue;
    const candidata = substituirTotaisMataripe(itens, valores, largura, linha.y);
    if (leituraMataripeReconcilia(candidata, largura)) return candidata;
  }
  return itens;
}
