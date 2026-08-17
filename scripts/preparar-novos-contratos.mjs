import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const [, , pastaModelos, pastaSaida = "output/templates-docx"] = process.argv;
if (!pastaModelos) throw new Error("Informe a pasta que contém os contratos originais.");

const escapeXml = (texto) => texto
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const decodeXml = (texto) => texto
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

function substituirNoParagrafo(paragrafo, busca, valor, todas = false) {
  let atual = paragrafo;
  let substituicoes = 0;

  while (true) {
    const nos = [...atual.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => ({
      inicio: match.index,
      fim: match.index + match[0].length,
      abertura: match[0].slice(0, match[0].indexOf(">") + 1),
      texto: decodeXml(match[1]),
      fechamento: "</w:t>",
    }));
    const textoCompleto = nos.map((no) => no.texto).join("");
    const posicao = textoCompleto.indexOf(busca);
    if (posicao === -1) break;

    const fimBusca = posicao + busca.length;
    let cursor = 0;
    const alterados = nos.map((no) => {
      const inicioNo = cursor;
      const fimNo = cursor + no.texto.length;
      cursor = fimNo;
      if (fimNo <= posicao || inicioNo >= fimBusca) return no.texto;

      const prefixo = posicao > inicioNo ? no.texto.slice(0, posicao - inicioNo) : "";
      const sufixo = fimBusca < fimNo ? no.texto.slice(fimBusca - inicioNo) : "";
      const iniciaAqui = posicao >= inicioNo && posicao < fimNo;
      return prefixo + (iniciaAqui ? valor : "") + sufixo;
    });

    for (let i = nos.length - 1; i >= 0; i--) {
      const no = nos[i];
      const novoNo = `${no.abertura}${escapeXml(alterados[i])}${no.fechamento}`;
      atual = atual.slice(0, no.inicio) + novoNo + atual.slice(no.fim);
    }
    substituicoes++;
    if (!todas) break;
  }

  return { xml: atual, substituicoes };
}

function substituirEmXml(xml, regra) {
  let total = 0;
  const novoXml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragrafo) => {
    const resultado = substituirNoParagrafo(paragrafo, regra.busca, regra.valor, regra.todas);
    total += resultado.substituicoes;
    return resultado.xml;
  });
  return { xml: novoXml, total };
}

const modelos = [
  {
    origem: "CONTRATO CONTRIBUIÇÃO EXTRAORDINARIA.docx",
    destino: "contrato_contribuicao_extraordinaria.docx",
    regras: [
      { busca: "VITOR PEREIRA E PADUA", valor: "{NOME_CLIENTE}", todas: true },
      { busca: "industriário", valor: "{PROFISSAO}" },
      { busca: "118.120.927-76", valor: "{CPF}" },
      { busca: "Rua Amarantina, 18, Casa A, Taquara,Rio de Janeiro, Rio de Janeiro, Cep. 22710-180", valor: "{ENDERECO_COMPLETO}" },
      { busca: "20,0% (vinte por cento)", valor: "{HONORARIOS_PCT}% ({HONORARIOS_EXTENSO} por cento)" },
      { busca: "Salvador, 16/06/2026", valor: "{LOCAL_ASSINATURA}, {DATA}" },
      { busca: "CONTRATO:", valor: "CONTRATO: {NUMERO_CONTRATO}" },
    ],
  },
  {
    origem: "CONTRATO SUPRESSÃO DE FOLGAS.docx",
    destino: "contrato_supressao_folgas.docx",
    regras: [
      { busca: "VITOR PEREIRA E PADUA", valor: "{NOME_CLIENTE}", todas: true },
      { busca: "brasileiro", valor: "{NACIONALIDADE}" },
      { busca: "industriário", valor: "{PROFISSAO}" },
      { busca: "118.120.927-76", valor: "{CPF}" },
      { busca: "Rua Amarantina, n° 18, Casa A, Taquara, Rio de Janeiro, Rio de Janeiro, CEP 22710-180", valor: "{ENDERECO_COMPLETO}" },
      { busca: "20% (vinte por cento)", valor: "{HONORARIOS_PCT}% ({HONORARIOS_EXTENSO} por cento)" },
      { busca: "Salvador, 28/03/2023 12:37:00", valor: "{LOCAL_ASSINATURA}, {DATA}" },
      { busca: "CONTRATO:", valor: "CONTRATO: {NUMERO_CONTRATO}" },
    ],
  },
];

const dadosTeste = {
  NOME_CLIENTE: "CLIENTE DE TESTE",
  NACIONALIDADE: "brasileiro(a)",
  PROFISSAO: "profissão de teste",
  CPF: "000.000.000-00",
  ENDERECO_COMPLETO: "Endereço de teste",
  HONORARIOS_PCT: "20",
  HONORARIOS_EXTENSO: "vinte",
  LOCAL_ASSINATURA: "Salvador/BA",
  DATA: "17/08/2026",
  NUMERO_CONTRATO: "12345",
};

fs.mkdirSync(pastaSaida, { recursive: true });

for (const modelo of modelos) {
  const origem = path.join(pastaModelos, modelo.origem);
  const zip = new PizZip(fs.readFileSync(origem));

  for (const nomeParte of zip.file(/^word\/.*\.xml$/).map((arquivo) => arquivo.name)) {
    let xml = zip.file(nomeParte).asText();
    for (const regra of modelo.regras) {
      const resultado = substituirEmXml(xml, regra);
      xml = resultado.xml;
      regra.encontradas = (regra.encontradas ?? 0) + resultado.total;
    }
    zip.file(nomeParte, xml);
  }

  const ausentes = modelo.regras.filter((regra) => !regra.encontradas).map((regra) => regra.busca);
  if (ausentes.length > 0) throw new Error(`${modelo.origem}: campos não encontrados: ${ausentes.join(" | ")}`);

  const destino = path.join(pastaSaida, modelo.destino);
  fs.writeFileSync(destino, zip.generate({ type: "nodebuffer" }));

  const validacao = new Docxtemplater(new PizZip(fs.readFileSync(destino)), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });
  validacao.render(dadosTeste);
  if (/VITOR PEREIRA E PADUA|118\.120\.927-76/.test(validacao.getFullText())) {
    throw new Error(`${modelo.destino}: dados pessoais de exemplo permaneceram no arquivo.`);
  }
  console.log(`OK ${modelo.destino}`);
}
