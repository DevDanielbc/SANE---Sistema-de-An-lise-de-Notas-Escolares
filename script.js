const CHAVE_DADOS = "sane-students";
const formulario = document.querySelector("#student-form");
const listaEstudantes = document.querySelector("#student-list");
const estadoVazio = document.querySelector("#empty-state");
const mensagemErro = document.querySelector("#form-error");
const totalEstudantes = document.querySelector("#student-count");
const mediaTurma = document.querySelector("#class-average");
const totalAprovados = document.querySelector("#approved-count");
const totalAtencao = document.querySelector("#attention-count");
const totalNaLista = document.querySelector("#list-count");

let estudantes = carregarEstudantes();

function carregarEstudantes() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_DADOS) || "[]");

    if (!Array.isArray(dados)) {
      throw new Error("Os dados salvos não estão no formato esperado.");
    }

    return dados.filter((estudante) =>
      estudante &&
      typeof estudante.id === "string" &&
      typeof estudante.name === "string" &&
      Array.isArray(estudante.grades) &&
      estudante.grades.length === 4 &&
      estudante.grades.every((nota) => Number.isFinite(nota) && nota >= 0 && nota <= 10)
    );
  } catch (erro) {
    console.error("Não foi possível carregar os estudantes salvos.", erro);
    return [];
  }
}

function salvarEstudantes() {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(estudantes));
    return true;
  } catch (erro) {
    console.error("Não foi possível salvar os estudantes.", erro);
    return false;
  }
}

function calcularMedia(notas) {
  return notas.reduce((soma, nota) => soma + nota, 0) / notas.length;
}

function obterSituacao(media) {
  if (media >= 7) return { texto: "Aprovado", classe: "approved" };
  if (media >= 5) return { texto: "Recuperação", classe: "recovery" };
  return { texto: "Atenção", classe: "attention" };
}

function formatarNota(nota) {
  return nota.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function criarCelula(texto, classe = "") {
  const celula = document.createElement("td");
  celula.textContent = texto;
  celula.className = classe;
  return celula;
}

function criarLinhaEstudante(estudante, indice) {
  const media = calcularMedia(estudante.grades);
  const situacao = obterSituacao(media);
  const linha = document.createElement("tr");
  const celulaNome = criarCelula("");
  const identificacao = document.createElement("div");
  identificacao.className = "student-cell";

  const avatar = document.createElement("span");
  avatar.className = `student-avatar tone-${indice % 4}`;
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = estudante.name.trim().charAt(0).toLocaleUpperCase("pt-BR");

  const nome = document.createElement("span");
  nome.textContent = estudante.name;
  identificacao.append(avatar, nome);
  celulaNome.append(identificacao);

  const celulaSituacao = criarCelula("");
  const etiquetaSituacao = document.createElement("span");
  etiquetaSituacao.className = `status ${situacao.classe}`;
  etiquetaSituacao.textContent = situacao.texto;
  celulaSituacao.append(etiquetaSituacao);

  const celulaAcao = criarCelula("");
  const botaoRemover = document.createElement("button");
  botaoRemover.className = "delete-button";
  botaoRemover.type = "button";
  botaoRemover.setAttribute("aria-label", `Remover ${estudante.name}`);
  botaoRemover.textContent = "×";
  botaoRemover.addEventListener("click", () => removerEstudante(estudante.id));
  celulaAcao.append(botaoRemover);

  linha.append(
    celulaNome,
    criarCelula(estudante.grades.map(formatarNota).join(" · "), "grade-list"),
    criarCelula(formatarNota(media), "average-cell"),
    celulaSituacao,
    celulaAcao
  );
  return linha;
}

function atualizarPainel() {
  listaEstudantes.replaceChildren(...estudantes.map(criarLinhaEstudante));
  estadoVazio.hidden = estudantes.length > 0;
  totalEstudantes.textContent = String(estudantes.length);
  totalNaLista.textContent =
    `${estudantes.length} ${estudantes.length === 1 ? "estudante" : "estudantes"}`;

  const medias = estudantes.map((estudante) => calcularMedia(estudante.grades));
  const mediaGeral = medias.length
    ? medias.reduce((soma, media) => soma + media, 0) / medias.length
    : null;

  mediaTurma.textContent = mediaGeral === null ? "—" : formatarNota(mediaGeral);
  totalAprovados.textContent = String(medias.filter((media) => media >= 7).length);
  totalAtencao.textContent = String(medias.filter((media) => media < 5).length);
}

function removerEstudante(id) {
  const estudantesAnteriores = estudantes;
  estudantes = estudantes.filter((estudante) => estudante.id !== id);

  if (!salvarEstudantes()) {
    estudantes = estudantesAnteriores;
    return;
  }

  atualizarPainel();
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  mensagemErro.hidden = true;

  if (!formulario.reportValidity()) return;

  const dadosFormulario = new FormData(formulario);
  const nome = String(dadosFormulario.get("name") || "").trim();
  const notas = ["grade1", "grade2", "grade3", "grade4"].map((campo) =>
    Number(dadosFormulario.get(campo))
  );

  if (!nome || notas.some((nota) => !Number.isFinite(nota) || nota < 0 || nota > 10)) {
    mensagemErro.textContent = "Informe um nome e notas válidas entre 0 e 10.";
    mensagemErro.hidden = false;
    return;
  }

  estudantes.push({ id: crypto.randomUUID(), name: nome, grades: notas });
  if (!salvarEstudantes()) {
    estudantes.pop();
    mensagemErro.textContent = "Não foi possível salvar os dados neste dispositivo.";
    mensagemErro.hidden = false;
    return;
  }

  formulario.reset();
  atualizarPainel();
  document.querySelector("#student-name").focus();
});

atualizarPainel();
