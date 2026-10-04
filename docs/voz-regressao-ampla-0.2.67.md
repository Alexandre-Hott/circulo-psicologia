# Regressão ampla de voz — 0.2.67

Snapshot funcional: commit `6c6809d`, branch `feature/assistente-voz-local-0.2.35`, 04/10/2026. Nenhuma mudança de produção durante esta execução. Instalado0.2.61/perfil preservados; somente dados fictícios em fixtures.

## Seleção e execução

Inventário via `rg --files test/e2e`, filtrando arquivos `voice|command` terminados em `.spec.js`, com separadores convertidos para `/`: **322 testes em26arquivos** na listagem do Playwright. Primeira listagem com caminhos Windows encontrou zero testes; corrigidos os separadores, sem alterar testes.

```powershell
$env:E2E_PORT='5199'
$voiceSpecs = @(rg --files test/e2e | Where-Object { $_ -match '(voice|command).*\.spec\.js$' } | ForEach-Object { $_ -replace '\\','/' })
npx playwright test @voiceSpecs
```

Execução pelo principal com worker único/Edge headless: **319 passaram, 3 falharam, 25,8 minutos, exit 1**. Todos os 322 casos terminaram; sem retries automáticos ou aumento de timeouts. As três falhas abaixo são aguardas por seletores antigos no setup. Depois da correção mínima, os três casos passaram na rodada focal final. Isso é evidência composta, não uma execução integral de 322 verdes.

Primeira rodada focal após correção de nomes: **2 passaram, 1 falhou em 54,7 s**, porta 5208. O teste de troca de paciente aguardava opção 1, mas seu contexto real mostra opção 2: a fixture retorna a lista completa de rascunhos, mantendo a numeração global. Trace/contexto preservados em `test-results-5208/desktop-voice-interface-re-0611e-ada-após-trocar-de-paciente`. Correção final vincula o botão ao record `draft:remove-next` e exige nome acessível exato. Rodada final: **3/3 passaram em 26,4 s**, porta 5209, exit 0. Nenhum teste ou asserção foi removido; produção preservada.

## Limites da evidência

Casos 50/51 falharam no setup por timeout aguardando botão de nome acessível antigo `Retomar rascunho 2026-10-02`. O botão atual inclui opção visível desde 0.2.66. Contextos/trace preservados em `test-results-5199/desktop-voice-interface-re-0d7f5-ada-após-trocar-de-rascunho` e `desktop-voice-interface-re-0611e-ada-após-trocar-de-paciente`. Caso 125 também falhou no seletor antigo em `desktop-voice-library.spec.js:182`; contexto em `test-results-5199/desktop-voice-library-prop-d413f-ravessa-a-troca-de-rascunho`. O snapshot ficou congelado até o resultado terminal, sem mudança de produção ou dos 26 arquivos selecionados durante a suíte.

[Matriz atual das oito áreas](voz-matriz-atual-0.2.67.md): leitura estática, com rota/teste/fonte/limites separados. G2 (limpeza desabilitada) é exceção deliberada já fora do escopo, não autorização para implementar recovery. G1 é diferença de gramática natural 1000 versus formulário 4000, com entrada do assistente limitada a 1200; a alternativa genérica não prova paridade completa. G3 tinha falta de evidência nativa do valor da escala; a [captura sintética específica e replay](voz-indicador-nativo-20261004.md) terminaram com dois intents corretos e 2/2 replays aprovados em 25,0 s, sem alterar a produção congelada.

A seleção abrange os arquivos atuais de voz/comando: navegação, pacientes, biblioteca, registros/sessões, agenda, análises, ajustes, identidade, confirmação, áudio simulado e transições. Não é toda a suíte E2E do repositório, nem prova de todos os enunciados possíveis. Nomes dos arquivos não substituem leitura das asserções.

Mídia/IPC/persistência dos testes são sintéticos. Reconhecimento real de WAVs SAPI tem evidência separada em `voz-audio-sintetico-20261003.md`; não é microfone físico ou jornada instalada. Senhas e escolha nativa de arquivos continuam manuais. Não publicar Release, instalar nova versão ou modificar dados clínicos para executar esta regressão.
