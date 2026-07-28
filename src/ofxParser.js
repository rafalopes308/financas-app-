// Parser simples de OFX (formato do Inter e outros bancos)
export function parseOFX(text) {
  const transactions = [];
  // Encontra todos os blocos <STMTTRN>...</STMTTRN>
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = match[1];
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`));
      return m ? m[1].trim() : "";
    };
    const dtPosted = getTag("DTPOSTED"); // YYYYMMDD...
    const amount = parseFloat(getTag("TRNAMT"));
    const memo = getTag("MEMO") || getTag("NAME") || "Sem descrição";
    const fitid = getTag("FITID");
    const trntype = getTag("TRNTYPE");

    if (!dtPosted || isNaN(amount)) continue;

    const year = dtPosted.substring(0, 4);
    const month = dtPosted.substring(4, 6);
    const day = dtPosted.substring(6, 8);
    const date = `${year}-${month}-${day}`;

    transactions.push({
      fitid,
      date,
      desc: memo.replace(/\s+/g, " ").trim(),
      value: Math.abs(amount),
      type: amount < 0 ? "despesa" : "receita",
      trntype,
    });
  }
  return transactions;
}

// Normaliza a descrição para servir de chave da memória de categorias
// (remove acentos, números de parcela/data e pontuação, pra "IFOOD *IFOOD 12/07"
// e "IFOOD *IFOOD 03/08" caírem na mesma chave)
export function normalizeDesc(desc) {
  return String(desc || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sugere categoria baseado em palavras-chave
export function suggestCategory(desc, type) {
  const d = desc.toLowerCase();
  if (type === "receita") {
    if (d.includes("salario") || d.includes("salário") || d.includes("folha")) return "Salário";
    if (d.includes("pix recebido") || d.includes("transferencia recebida")) return "Outros";
    return "Outros";
  }
  // despesa
  if (d.match(/ifood|rappi|uber eats|restaurante|lanchonete|padaria|supermercado|mercado|hortifrut/)) return "Alimentação";
  if (d.match(/uber|99|taxi|gasolina|posto|estacionamento|metro|onibus|combust/)) return "Transporte";
  if (d.match(/aluguel|condominio|luz|agua|gas|internet|net |vivo |tim |claro/)) return "Moradia";
  if (d.match(/farmacia|drogari|hospital|consulta|medico|dentista|psico/)) return "Saúde";
  if (d.match(/cinema|netflix|spotify|prime|disney|hbo|youtube|steam|playstat|xbox/)) return "Lazer";
  if (d.match(/escola|faculdade|curso|udemy|alura/)) return "Educação";
  if (d.match(/zara|renner|riachuelo|c&a|nike|adidas/)) return "Roupas";
  if (d.match(/academia|smartfit|crossfit/)) return "Esporte";
  return "Outros";
}
