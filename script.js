const CHAVE_DADOS = "sane-students";
const AVALIACOES = ["Avaliação 1", "Avaliação 2", "Avaliação 3", "Avaliação 4"];
const formulario = document.querySelector("#student-form");
const listaEstudantes = document.querySelector("#student-list");
const estadoVazio = document.querySelector("#empty-state");
const mensagemErro = document.querySelector("#form-error");
const arquivoNotas = document.querySelector("#arquivo-notas");
const mensagemImportacao = document.querySelector("#mensagem-importacao");
const visaoGeral = document.querySelector("#visao-geral");
const graficos = document.querySelector("#graficos");
let estudantes = carregarEstudantes();

function carregarEstudantes() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_DADOS) || "[]");
    if (!Array.isArray(dados)) throw new Error("Os dados salvos não estão no formato esperado.");
    return dados.filter((estudante) =>
      estudante && typeof estudante.id === "string" && typeof estudante.name === "string" &&
      Array.isArray(estudante.grades) && estudante.grades.length === 4 &&
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
  return nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  document.querySelector("#student-count").textContent = String(estudantes.length);
  document.querySelector("#list-count").textContent =
    `${estudantes.length} ${estudantes.length === 1 ? "estudante" : "estudantes"}`;

  const medias = estudantes.map((estudante) => calcularMedia(estudante.grades));
  const mediaGeral = medias.length
    ? medias.reduce((soma, media) => soma + media, 0) / medias.length
    : null;
  document.querySelector("#class-average").textContent =
    mediaGeral === null ? "—" : formatarNota(mediaGeral);
  document.querySelector("#approved-count").textContent =
    String(medias.filter((media) => media >= 7).length);
  document.querySelector("#attention-count").textContent =
    String(medias.filter((media) => media < 5).length);

  if (!graficos.hidden) atualizarGraficos();
}

function removerEstudante(id) {
  const anteriores = estudantes;
  estudantes = estudantes.filter((estudante) => estudante.id !== id);
  if (!salvarEstudantes()) {
    estudantes = anteriores;
    return;
  }
  atualizarPainel();
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  mensagemErro.hidden = true;
  if (!formulario.reportValidity()) return;

  const dados = new FormData(formulario);
  const nome = String(dados.get("name") || "").trim();
  const notas = ["grade1", "grade2", "grade3", "grade4"].map((campo) => Number(dados.get(campo)));
  if (!nome || notas.some((nota) => !Number.isFinite(nota) || nota < 0 || nota > 10)) {
    mensagemErro.textContent = "Informe um nome e notas válidas entre 0 e 10.";
    mensagemErro.hidden = false;
    return;
  }

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  estudantes.push({ id, name: nome, grades: notas });
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

function exibirMensagemImportacao(texto, tipo) {
  mensagemImportacao.textContent = texto;
  mensagemImportacao.className = `import-message ${tipo}`;
  mensagemImportacao.hidden = false;
}

arquivoNotas.addEventListener("change", async () => {
  const arquivo = arquivoNotas.files[0];
  if (!arquivo) return;

  mensagemImportacao.hidden = true;
  const dados = new FormData();
  dados.append("arquivo", arquivo);
  dados.append("nomes_existentes", JSON.stringify(estudantes.map((estudante) => estudante.name)));

  try {
    const resposta = await fetch("/api/importar", { method: "POST", body: dados });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro || "Não foi possível importar o arquivo.");

    const importados = resultado.estudantes.map((estudante) => ({
      ...estudante,
      id: typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    const anteriores = estudantes;
    estudantes = [...estudantes, ...importados];
    if (!salvarEstudantes()) {
      estudantes = anteriores;
      throw new Error("Não foi possível salvar os dados importados neste dispositivo.");
    }

    atualizarPainel();
    exibirMensagemImportacao(
      `${importados.length} ${importados.length === 1 ? "estudante importado" : "estudantes importados"} com sucesso.`,
      "success"
    );
  } catch (erro) {
    exibirMensagemImportacao(erro.message || "Falha na importação. Verifique o arquivo e tente novamente.", "error");
  } finally {
    arquivoNotas.value = "";
  }
});

function atualizarDestaques(destaques) {
  const media = document.querySelector("#media-graficos");
  const maior = document.querySelector("#maior-nota");
  const menor = document.querySelector("#menor-nota");
  if (!destaques) {
    media.textContent = maior.textContent = menor.textContent = "—";
    document.querySelector("#detalhe-maior-nota").textContent = "Aguardando estudantes";
    document.querySelector("#detalhe-menor-nota").textContent = "Aguardando estudantes";
    return;
  }

  media.textContent = formatarNota(destaques.media);
  maior.textContent = formatarNota(destaques.maior.nota);
  menor.textContent = formatarNota(destaques.menor.nota);
  document.querySelector("#detalhe-maior-nota").textContent =
    `${destaques.maior.nome} · ${destaques.maior.avaliacao}`;
  document.querySelector("#detalhe-menor-nota").textContent =
    `${destaques.menor.nome} · ${destaques.menor.avaliacao}`;
}

async function atualizarGraficos() {
  const grade = document.querySelector("#grade-graficos");
  const vazios = document.querySelector("#graficos-vazios");
  const erroGraficos = document.querySelector("#erro-graficos");
  erroGraficos.hidden = true;

  if (!estudantes.length) {
    grade.hidden = true;
    vazios.hidden = false;
    atualizarDestaques(null);
    return;
  }
  vazios.hidden = true;
  grade.hidden = false;

  try {
    const resposta = await fetch("/api/graficos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estudantes }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível gerar os gráficos.");

    atualizarDestaques(dados.destaques);
    const graficosDaPagina = [
      ["grafico-comparacao", dados.figuras.comparacao, "Comparação de notas por estudante e avaliação"],
      ["grafico-distribuicao", dados.figuras.distribuicao, "Distribuição das notas em cada avaliação"],
      ["grafico-medias", dados.figuras.medias, "Média geral de cada estudante"],
      ["grafico-turma", dados.figuras.turma, "Média da turma em cada avaliação"],
    ];
    graficosDaPagina.forEach(([id, imagem, descricao]) => {
      if (typeof imagem !== "string" || !imagem.startsWith("data:image/png;base64,")) {
        throw new Error("O servidor retornou uma imagem de gráfico inválida.");
      }
      const elemento = document.createElement("img");
      elemento.className = "chart-image";
      elemento.src = imagem;
      elemento.alt = descricao;
      document.querySelector(`#${id}`).replaceChildren(elemento);
    });
  } catch (erro) {
    erroGraficos.textContent = erro.message || "Não foi possível gerar os gráficos.";
    erroGraficos.hidden = false;
  }
}

function atualizarNavegacao() {
  const mostrarGraficos = window.location.hash === "#graficos";
  visaoGeral.hidden = mostrarGraficos;
  graficos.hidden = !mostrarGraficos;
  document.querySelector("#pagina-atual").textContent =
    mostrarGraficos ? "Gráficos" : window.location.hash === "#estudantes" ? "Estudantes" : "Visão geral";
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle(
      "active",
      link.hash === window.location.hash ||
        (!mostrarGraficos && link.hash === "#painel" && window.location.hash !== "#estudantes")
    );
  });
  if (mostrarGraficos) atualizarGraficos();
}

window.addEventListener("hashchange", atualizarNavegacao);

atualizarPainel();
atualizarNavegacao();
