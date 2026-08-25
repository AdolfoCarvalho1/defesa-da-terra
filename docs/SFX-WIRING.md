# SFX-WIRING — pacote extra de SFX (assets/sfx-extra.js)

Pacote aditivo de SFX pixel/8-bit. Estende `window.SND` (= `window.AudioSys`) **sem
substituir nenhum som existente** — cada função só é criada se ainda não existir.

## Como ativar

Insira esta linha no `index.html`, **imediatamente depois** da tag do audio.js
(atualmente na linha 594):

```html
<script src="assets/sfx-extra.js"></script>
```

Ou seja, o bloco fica assim:

```html
<script src="phaser.min.js"></script>
<script src="assets/data.js"></script>
<script src="assets/pixelart.js"></script>
<script src="assets/audio.js"></script>
<script src="assets/sfx-extra.js"></script>   <!-- SFX extras 8-bit -->
<script src="assets/scenes.js"></script>
```

Tem que ficar entre `audio.js` e `scenes.js`: precisa do objeto já criado e quer
rodar antes dos primeiros usos em `scenes.js`. Sem a tag, o jogo funciona igual a hoje.

## O que adiciona

| Função | Som |
|---|---|
| `SND.tierUp()` | fanfarra curta de tier/merge (arpejo quadrado ascendente) |
| `SND.merge()` | sucção + impacto |
| `SND.superReady()` | chime cristalino |
| `SND.factory()` | martelo industrial curto (2 batidas) |
| `SND.lab()` | bolha científica |

Nota: a tarefa pedia também `SND.superFire` — esse nome **já existe** em `audio.js`
(linha 182). O pacote é estritamente aditivo, então não o sobrescreve; o impacto
dramático extra foi exposto como `SND.superFireX`.

## Uso

```js
SND.tierUp();      // subiu tier / mergeou torre
SND.merge();       // animação de merge
SND.superReady();  // super carregada
SND.factory();     // torre/edifício de fábrica
SND.lab();         // torre/edifício de laboratório
```

Tudo sintetizado via Web Audio (ondas quadradas, arpejos rápidos, volumes baixos),
passando pelo `sfxGain` existente — mute e volume master do jogo valem para os novos sons.
