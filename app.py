import csv
import base64
import io
import json
import math
import re
import unicodedata
import zipfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from openpyxl.utils.exceptions import InvalidFileException
from flask import Flask, jsonify, request, send_from_directory
from xlrd.biffh import XLRDError


PASTA = Path(__file__).resolve().parent
AVALIACOES = [f"Avaliação {numero}" for numero in range(1, 5)]
CORES = ["#7969e8", "#4d9ce0", "#48aa78", "#e7a446"]
COR_TEXTO = "#77778b"

app = Flask(__name__, static_folder=str(PASTA), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(caractere for caractere in texto if not unicodedata.combining(caractere))
    return re.sub(r"[^a-z0-9]", "", texto.lower())


def ler_tabela(arquivo):
    extensao = Path(arquivo.filename or "").suffix.lower()
    conteudo = arquivo.read()

    if not conteudo:
        raise ValueError("O arquivo está vazio.")

    try:
        if extensao == ".csv":
            texto = conteudo.decode("utf-8-sig")
            primeira_linha = texto.splitlines()[0]
            delimitador = csv.Sniffer().sniff(primeira_linha, delimiters=",;\t").delimiter
            return pd.read_csv(io.StringIO(texto), sep=delimitador, dtype=object)
        if extensao in {".xlsx", ".xls"}:
            return pd.read_excel(io.BytesIO(conteudo), dtype=object)
    except (
        UnicodeDecodeError,
        csv.Error,
        pd.errors.ParserError,
        pd.errors.EmptyDataError,
        ImportError,
        ValueError,
        OSError,
        zipfile.BadZipFile,
        InvalidFileException,
        XLRDError,
    ) as erro:
        raise ValueError("Não foi possível ler o arquivo. Confira o formato e os dados.") from erro

    raise ValueError("Formato incompatível. Selecione um arquivo CSV ou Excel (.xlsx, .xls).")


def encontrar_colunas(colunas):
    nomes = {
        "nome", "aluno", "estudante", "nomedoaluno", "nomedoestudante"
    }
    cabecalhos = [normalizar(coluna) for coluna in colunas]
    coluna_nome = next((i for i, nome in enumerate(cabecalhos) if nome in nomes), None)
    colunas_notas = []

    for numero in range(1, 5):
        padrao = re.compile(rf"^(avaliacao|nota|grade|av|prova){numero}$")
        indice = next((i for i, nome in enumerate(cabecalhos) if padrao.fullmatch(nome)), None)
        colunas_notas.append(indice)

    if coluna_nome is None or any(indice is None for indice in colunas_notas):
        raise ValueError(
            "Cabeçalhos incompatíveis. Use Nome e Avaliação 1, Avaliação 2, "
            "Avaliação 3 e Avaliação 4."
        )
    return [coluna_nome, *colunas_notas]


def converter_nota(valor):
    if pd.isna(valor):
        return None
    try:
        texto = str(valor).strip().replace(",", ".")
        nota = float(texto)
    except (TypeError, ValueError):
        return None
    return nota if math.isfinite(nota) else None


def validar_tabela(tabela, nomes_existentes):
    if tabela.empty:
        raise ValueError("A tabela precisa ter pelo menos um estudante.")

    indices = encontrar_colunas(tabela.columns)
    importados = []
    erros = []
    nomes_vistos = {normalizar(nome) for nome in nomes_existentes}

    for numero_linha, linha in enumerate(tabela.itertuples(index=False, name=None), start=2):
        nome = str(linha[indices[0]]).strip() if not pd.isna(linha[indices[0]]) else ""
        notas = [converter_nota(linha[indice]) for indice in indices[1:]]
        problemas = []

        if not nome:
            problemas.append("nome ausente")
        for numero, nota in enumerate(notas, start=1):
            if nota is None:
                problemas.append(f"Avaliação {numero} ausente ou inválida")
            elif not 0 <= nota <= 10:
                problemas.append(f"Avaliação {numero} fora do intervalo de 0 a 10")

        nome_normalizado = normalizar(nome)
        if nome and nome_normalizado in nomes_vistos:
            problemas.append("nome duplicado")

        if problemas:
            erros.append(f"Linha {numero_linha}: {', '.join(problemas)}.")
        else:
            nomes_vistos.add(nome_normalizado)
            importados.append({"name": nome, "grades": notas})

    if erros:
        resumo = " ".join(erros[:8])
        if len(erros) > 8:
            resumo += f" E mais {len(erros) - 8} erro(s)."
        raise ValueError(resumo)
    return importados


def serializar_grafico(figura):
    buffer = io.BytesIO()
    figura.savefig(buffer, format="png", dpi=120, bbox_inches="tight")
    plt.close(figura)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def configurar_eixo(eixo, titulo, eixo_x, eixo_y):
    eixo.set_title(titulo, color="#55556b", fontsize=12, pad=14)
    eixo.set_xlabel(eixo_x, color=COR_TEXTO)
    eixo.set_ylabel(eixo_y, color=COR_TEXTO)
    eixo.set_ylim(0, 10)
    eixo.set_yticks(range(0, 11, 2))
    eixo.grid(axis="y", color="#f0f0f5")
    eixo.set_axisbelow(True)
    eixo.spines[["top", "right"]].set_visible(False)
    eixo.tick_params(colors=COR_TEXTO, labelsize=9)


def gerar_graficos(estudantes):
    if not isinstance(estudantes, list):
        raise ValueError("A lista de estudantes enviada é inválida.")

    nomes = []
    notas_por_estudante = []
    for estudante in estudantes:
        if not isinstance(estudante, dict):
            raise ValueError("Há um estudante com dados inválidos.")
        nome = str(estudante.get("name", "")).strip()
        notas = estudante.get("grades")
        if not nome or not isinstance(notas, list) or len(notas) != 4:
            raise ValueError("Confira os nomes e as quatro notas dos estudantes.")
        notas_convertidas = [converter_nota(nota) for nota in notas]
        if any(nota is None or not 0 <= nota <= 10 for nota in notas_convertidas):
            raise ValueError("As notas devem ser números entre 0 e 10.")
        nomes.append(nome)
        notas_por_estudante.append(notas_convertidas)

    if not nomes:
        return {"figuras": {}, "destaques": None}

    medias = [sum(notas) / 4 for notas in notas_por_estudante]
    posicoes = list(range(len(nomes)))
    largura = 0.8 / len(AVALIACOES)
    figura_comparacao, eixo_comparacao = plt.subplots(figsize=(8, 3.5))
    for indice, avaliacao in enumerate(AVALIACOES):
        eixo_comparacao.bar(
            [posicao + (indice - 1.5) * largura for posicao in posicoes],
            [notas[indice] for notas in notas_por_estudante],
            width=largura,
            label=avaliacao,
            color=CORES[indice],
        )
    configurar_eixo(eixo_comparacao, "Notas dos estudantes por avaliação", "Estudante", "Nota")
    eixo_comparacao.set_xticks(posicoes, nomes, rotation=30, ha="right")
    eixo_comparacao.legend(
        loc="upper center", bbox_to_anchor=(0.5, 1.17), ncol=4, frameon=False, fontsize=8
    )

    figura_distribuicao, eixo_distribuicao = plt.subplots(figsize=(8, 3.5))
    caixas = eixo_distribuicao.boxplot(
        [[notas[indice] for notas in notas_por_estudante] for indice in range(4)],
        patch_artist=True,
        showmeans=True,
    )
    eixo_distribuicao.set_xticks(range(1, 5), AVALIACOES)
    for caixa, cor in zip(caixas["boxes"], CORES):
        caixa.set_facecolor(cor)
        caixa.set_alpha(0.35)
        caixa.set_edgecolor(cor)
    for mediana, cor in zip(caixas["medians"], CORES):
        mediana.set_color(cor)
    configurar_eixo(
        eixo_distribuicao, "Distribuição das notas em cada avaliação", "Avaliação", "Nota"
    )

    cores_medias = [
        "#48aa78" if media >= 7 else "#e7a446" if media >= 5 else "#df7880"
        for media in medias
    ]
    figura_medias, eixo_medias = plt.subplots(figsize=(8, 3.5))
    barras_medias = eixo_medias.bar(posicoes, medias, color=cores_medias)
    configurar_eixo(eixo_medias, "Média geral de cada estudante", "Estudante", "Média")
    eixo_medias.set_xticks(posicoes, nomes, rotation=30, ha="right")
    eixo_medias.bar_label(barras_medias, fmt="%.1f", padding=3, fontsize=8, color=COR_TEXTO)

    medias_avaliacoes = [
        sum(notas[indice] for notas in notas_por_estudante) / len(nomes)
        for indice in range(4)
    ]
    figura_turma, eixo_turma = plt.subplots(figsize=(8, 3.5))
    barras_turma = eixo_turma.bar(AVALIACOES, medias_avaliacoes, color=CORES)
    configurar_eixo(eixo_turma, "Média da turma em cada avaliação", "Avaliação", "Média")
    eixo_turma.bar_label(barras_turma, fmt="%.1f", padding=3, fontsize=8, color=COR_TEXTO)

    todas_notas = [
        (nota, nome, AVALIACOES[indice])
        for nome, notas in zip(nomes, notas_por_estudante)
        for indice, nota in enumerate(notas)
    ]
    maior = max(todas_notas, key=lambda item: item[0])
    menor = min(todas_notas, key=lambda item: item[0])
    destaques = {
        "media": sum(nota for nota, _, _ in todas_notas) / len(todas_notas),
        "maior": {"nota": maior[0], "nome": maior[1], "avaliacao": maior[2]},
        "menor": {"nota": menor[0], "nome": menor[1], "avaliacao": menor[2]},
    }
    return {
        "figuras": {
            "comparacao": serializar_grafico(figura_comparacao),
            "distribuicao": serializar_grafico(figura_distribuicao),
            "medias": serializar_grafico(figura_medias),
            "turma": serializar_grafico(figura_turma),
        },
        "destaques": destaques,
    }


@app.get("/")
def inicio():
    return send_from_directory(PASTA, "index.html")


@app.get("/modelo-notas.csv")
def modelo_csv():
    conteudo = "Nome;Avaliação 1;Avaliação 2;Avaliação 3;Avaliação 4\n"
    return app.response_class(
        conteudo, mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=modelo-notas.csv"}
    )


@app.post("/api/importar")
def importar_tabela():
    arquivo = request.files.get("arquivo")
    if not arquivo:
        return jsonify({"erro": "Selecione um arquivo CSV ou Excel."}), 400
    try:
        nomes_existentes = json.loads(request.form.get("nomes_existentes", "[]"))
        if not isinstance(nomes_existentes, list):
            raise ValueError("A lista de estudantes atuais é inválida.")
        tabela = ler_tabela(arquivo)
        estudantes = validar_tabela(tabela, nomes_existentes)
        return jsonify({"estudantes": estudantes})
    except (ValueError, json.JSONDecodeError) as erro:
        return jsonify({"erro": str(erro)}), 400


@app.post("/api/graficos")
def api_graficos():
    try:
        dados = request.get_json(force=True)
        return jsonify(gerar_graficos(dados.get("estudantes")))
    except (AttributeError, TypeError, ValueError) as erro:
        return jsonify({"erro": str(erro)}), 400


@app.errorhandler(413)
def arquivo_grande(_erro):
    return jsonify({"erro": "O arquivo excede o limite de 10 MB."}), 413


if __name__ == "__main__":
    app.run()
