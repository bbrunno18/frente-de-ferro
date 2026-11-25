/** História de origem da guerra: exibida no prólogo da campanha e em "A Origem da Guerra". */
export interface LoreCard { year: string; title: string; text: string; mood: 'calm' | 'warn' | 'dark' | 'fire' }

export const LORE: LoreCard[] = [
  { year: 'Ano 0', title: 'O Cristal', mood: 'calm',
    text: 'Na Grande Planície brotou o Cristal de Cobalto: uma pedra azul que guarda energia e a devolve sem fumaça. Em uma geração, as cidades deixaram o carvão para trás. Aurora, a cidade dos painéis solares, prometeu que ninguém mais passaria frio no escuro.' },
  { year: 'Ano 14', title: 'A Companhia', mood: 'calm',
    text: 'Quem tinha máquinas para cavar ficou rico. A Companhia Ferro-Cobalto, dona das minas, passou a vender energia a quem pagasse. O Concílio de Aurora, que dependia dessa energia, aceitou fechar os olhos: "A Companhia gera empregos. Um problema por vez."' },
  { year: 'Ano 31', title: 'O Relatório Arruda', mood: 'warn',
    text: 'A engenheira Helena Arruda mediu os campos e alertou: a Companhia retirava cristal mais rápido do que a terra o recriava, e o campo central de Meridiana estava instável. Pediu cotas e inspeção. O Concílio engavetou o relatório, pois as campanhas de seus membros eram pagas pela Companhia. A Companhia chamou o laudo de "alarmismo solar" e comprou um laudo contrário.' },
  { year: 'Ano 33', title: 'O Tratado que não nasceu', mood: 'warn',
    text: 'Em Rio das Garças, mediadores propuseram um tratado de cotas compartilhadas. Aurora exigiu inspeção total; a Companhia exigiu o controle das minas. Ninguém cedeu. O texto ficou sem assinatura e os dois lados voltaram para casa dizendo que o outro havia abandonado a mesa.' },
  { year: 'Ano 34', title: 'O Apagão', mood: 'dark',
    text: 'Meridiana colapsou. Em nove dias, a energia da Planície inteira se apagou. Hospitais, bombas d\'água e fábricas pararam. A Companhia salvou apenas as suas minas e vendeu o resto da energia a preço de resgate. Aurora respondeu requisitando os campos do sul. Cada lado jurava defender o povo; cada lado acusava o outro de ter causado tudo.' },
  { year: 'Ano 34, dia 41', title: 'O primeiro tiro', mood: 'fire',
    text: 'Um comboio da Companhia entrou nos Campos da Aurora para "recuperar equipamento". A Guarda Solar bloqueou a estrada. Ninguém sabe quem atirou primeiro, e a verdade nunca mais importou. Naquela noite, nasceram a Vanguarda Solar e o Sindicato Ferro. Você é o comandante que foi chamado para terminar a guerra que todos ajudaram a começar.' },
];

export const BLAMES: string[] = [
  'O Concílio engavetou um alerta técnico para não perder doações.',
  'A Companhia comprou um laudo falso em vez de reduzir a extração.',
  'Ninguém assinou o Tratado de Rio das Garças: a desconfiança valeu mais que a água e a luz.',
  'Os dois lados armaram milícias "só por precaução" antes de a primeira crise chegar.',
];
