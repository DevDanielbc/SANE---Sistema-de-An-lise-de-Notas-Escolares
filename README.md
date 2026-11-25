# SANE---Sistema-de-An-lise-de-Notas-Escolares

## Executar

É necessário ter Python 3.10 ou superior. No terminal, dentro da pasta do projeto, instale as dependências e inicie o servidor:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py app.py
```

Depois, abra `http://127.0.0.1:5000` no navegador. Não abra `index.html` diretamente: a importação e a geração dos gráficos usam o servidor Python.

## Importar planilhas

Na aba **Gráficos**, importe um arquivo `.csv`, `.xlsx` ou `.xls`. A tabela deve ter uma linha de cabeçalho com `Nome`, `Avaliação 1`, `Avaliação 2`, `Avaliação 3` e `Avaliação 4`. As notas devem estar entre 0 e 10. A importação informa dados ausentes, notas inválidas e estudantes duplicados sem adicionar parcialmente o arquivo.

Os estudantes continuam salvos no armazenamento local do navegador. O Flask processa as planilhas com pandas e gera os gráficos com Matplotlib.