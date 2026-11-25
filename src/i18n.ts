/**
 * Tradução PT → EN em tempo de execução. O código-fonte permanece em português (idioma-base);
 * quando o idioma é inglês, todo texto que aparece na tela (nós de texto e atributos title) passa
 * pelo dicionário abaixo. Textos dinâmicos usam as regras em RULES.
 */
export type Lang = 'pt' | 'en';

export function detectLang(pref: string | undefined): Lang {
  if (pref === 'pt' || pref === 'en') return pref;
  return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

const D: Record<string, string> = {
  // menu
  'Guarda Boreal': 'Boreal Guard', 'Cartel Víbora': 'Viper Cartel', 'ESTADO DE GUERRA · ANO 34': 'STATE OF WAR · YEAR 34', '⚠ ESTADO DE GUERRA · ANO 34': '⚠ STATE OF WAR · YEAR 34',
  'Exército inimigo': 'Enemy army', 'EXÉRCITO INIMIGO': 'ENEMY ARMY', '🎲 Aleatório': '🎲 Random', 'Inimigo aleatório': 'Random enemy', 'Configure a partida': 'Set up the match', 'Teatro de operações': 'Theater of operations', 'TEATRO DE OPERAÇÕES': 'THEATER OF OPERATIONS',
  'LEITURA TÁTICA': 'TACTICAL BRIEF', 'EM CAMPO': 'IN THE FIELD', '✔ EM CAMPO': '✔ IN THE FIELD', 'Blindagem': 'Armor', 'Energia': 'Power',
  'RESISTÊNCIA · ENERGIA': 'RESILIENCE · ENERGY', 'MOBILIDADE · ALCANCE': 'MOBILITY · RANGE', 'FORTALEZA · DEFESA': 'FORTRESS · DEFENSE', 'ECONOMIA · EMBOSCADA': 'ECONOMY · AMBUSH',
  '+20% blindagem · +30% energia': '+20% armor · +30% energy', '+20% velocidade · +20% alcance': '+20% speed · +20% range', '+35% blindagem · −15% velocidade': '+35% armor · −15% speed', '+25% cristal · +10% velocidade e alcance': '+25% crystal · +10% speed and range',
  'Exclusiva · Tanque Prisma · Pulso Solar': 'Exclusive · Prism Tank · Solar Pulse', 'Exclusiva · Artilharia Pesada · Barragem': 'Exclusive · Heavy Artillery · Barrage', 'Pulso Orbital · unidades quase indestrutíveis': 'Orbital Pulse · near-indestructible units', 'Barragem · mais dinheiro para gastar': 'Barrage · more money to spend',
  'Fim de manhã · céu aberto': 'Late morning · open sky', 'Nublado · luz rasante': 'Overcast · low light', 'Úmido · neblina baixa': 'Humid · low mist', 'Tarde dourada · calor': 'Golden afternoon · heat', 'Pôr do sol · sombras longas': 'Sunset · long shadows',
  'Terreno fechado': 'Closed terrain', 'Obstáculos médios': 'Medium obstacles', 'Terreno aberto': 'Open terrain', 'Água / pontes': 'Water / bridges', 'Campo': 'Field', 'Deserto': 'Desert', '🔊 Configurações': '🔊 Settings', 'Vitórias': 'Wins', 'Derrotas': 'Losses',
  'Engenheiro': 'Engineer', 'Transporte Blindado': 'Armored Transport', 'Tanque Criogênico': 'Cryo Tank', 'Vespa Veloz': 'Swift Wasp',
  'Desarmado. Ordene-o a atacar uma construção inimiga para CAPTURÁ-LA (ele é consumido). Frágil: escolte-o.': 'Unarmed. Order it to attack an enemy building to CAPTURE it (it is consumed). Fragile: escort it.',
  'Leva até 5 soldados. Toque no transporte com infantaria selecionada para embarcar; use Descer para desembarcar. Desarmado.': 'Carries up to 5 soldiers. Tap the transport with infantry selected to board; use Unload to disembark. Unarmed.',
  'Exclusivo da Guarda Boreal. Casco de gelo reforçado e feixe congelante de curto alcance, devastador contra infantaria e veículos.': 'Exclusive to the Boreal Guard. Reinforced ice hull and a short-range freezing beam, devastating against infantry and vehicles.',
  'Exclusiva do Cartel Víbora. Buggy de ataque muito rápido com mísseis anti-blindado e antiaéreos. Frágil.': 'Exclusive to the Viper Cartel. Very fast attack buggy with anti-armor and anti-air missiles. Fragile.',
  'Patrulha': 'Patrol', 'Guardar': 'Hold', 'Descer': 'Unload', 'Patrulhar: toque no destino, as tropas vão e voltam atacando': 'Patrol: tap the destination, troops go back and forth attacking',
  'Guardar posição: não persegue, só atira no que chega perto': 'Hold position: does not chase, only fires at what comes near', 'Descer: desembarca os soldados do transporte selecionado': 'Unload: disembarks the soldiers of the selected transport',
  'Toque no destino: a patrulha vai e volta atacando': 'Tap the destination: the patrol goes back and forth attacking', 'Selecione tropas armadas para patrulhar': 'Select armed troops to patrol', 'Selecione tropas armadas': 'Select armed troops',
  'Guardando posição: só atiram no que chega perto': 'Holding position: they only fire at what comes near', 'Selecione um Transporte Blindado': 'Select an Armored Transport', 'Patrulhando: as tropas vão e voltam atacando': 'Patrolling: troops go back and forth attacking',
  'CONSTRUÇÃO CAPTURADA': 'BUILDING CAPTURED', 'CONSTRUÇÃO PERDIDA': 'BUILDING LOST', 'Só é possível capturar construções inimigas': 'Only enemy buildings can be captured',
  '▲ Forte contra: ': '▲ Strong against: ', '▼ Fraco contra: ': '▼ Weak against: ', 'Construções': 'Buildings', 'Aéreos': 'Air',
  'Casamata': 'Pillbox', 'Obuseiro Fixo': 'Fixed Howitzer', 'Lança-Chamas': 'Flamethrower', 'Comando': 'Commando', 'Blindado Antiaéreo': 'Flak Track', 'Lança-Mísseis': 'Rocket Launcher', 'Caça de Ataque': 'Strike Jet', 'Bombardeiro': 'Bomber',
  'Abrigo de concreto com metralhadora pesada. Ótimo contra infantaria, fraco contra blindados.': 'Concrete shelter with a heavy machine gun. Great against infantry, weak against armor.',
  'Canhão pesado de longo alcance com dano em área. Protege a base contra blindados e artilharia.': 'Heavy long-range cannon with splash damage. Guards the base against armor and artillery.',
  'Curto alcance e fogo em área: limpa trincheiras de infantaria e castiga construções.': 'Short range, area fire: clears infantry trenches and punishes buildings.',
  'Soldado de elite: elimina infantaria com poucos disparos e derruba construções rápido. Caro e lento para treinar.': 'Elite soldier: kills infantry in a few shots and brings down buildings fast. Expensive and slow to train.',
  'Canhões automáticos de tiro rápido que só atingem aeronaves. Acompanhe o exército para cobrir o céu.': 'Rapid-fire autocannons that only hit aircraft. Keep it with the army to cover the sky.',
  'Caminhão com bateria de foguetes de longo alcance. Arrasa construções e tropas agrupadas, mas é frágil.': 'Truck with a long-range rocket battery. Wrecks buildings and grouped troops, but is fragile.',
  'Jato muito rápido com mísseis guiados. Caça blindados e outras aeronaves.': 'Very fast jet with guided missiles. Hunts armor and other aircraft.',
  'Aeronave pesada que despeja bombas em área. Devastador contra bases; indefeso contra caças e antiaéreos.': 'Heavy aircraft that drops area bombs. Devastating against bases; defenseless against fighters and anti-air.',
  '✖ Desmarcar': '✖ Deselect', 'Clique direito para mover ou atacar · clique esquerdo no chão desmarca': 'Right-click to move or attack · left-click on the ground deselects', '🧩 Modelos detalhados (teste)': '🧩 Detailed models (test)', 'Regras da partida': 'Match rules', 'Créditos iniciais': 'Starting credits', 'Superpoderes': 'Superpowers', 'Ligados': 'On', 'Desligados': 'Off', 'Névoa de guerra': 'Fog of war', 'Ligada': 'On', 'Mapa revelado': 'Revealed map', 'Lenta': 'Slow', 'Rápida': 'Fast',
  '⚙ Opções': '⚙ Options', 'Opções': 'Options', '◀ Voltar': '◀ Back', 'Superpoderes desligados nesta partida': 'Superpowers are off in this match',
  '🏅 Conquistas': '🏅 Achievements', 'Conquistas': 'Achievements', 'Recordes de vitória': 'Victory records', 'Vença escaramuças para registrar seus melhores tempos.': 'Win skirmishes to record your best times.',
  'Primeira Vitória': 'First Victory', 'Vença uma escaramuça.': 'Win a skirmish.', 'Sem Piedade': 'No Mercy', 'Vença uma escaramuça no Difícil.': 'Win a skirmish on Hard.', 'Mercenário': 'Mercenary', 'Vença com os 4 exércitos.': 'Win with all 4 armies.',
  'Blitzkrieg': 'Blitzkrieg', 'Vença uma escaramuça em menos de 8 minutos.': 'Win a skirmish in under 8 minutes.', 'Sol Nascente': 'Rising Sun', 'Conclua a campanha da Vanguarda Solar.': 'Finish the Solar Vanguard campaign.',
  'Punho de Ferro': 'Iron Fist', 'Conclua a campanha do Sindicato Ferro.': 'Finish the Iron Syndicate campaign.', 'Inverno Chegou': 'Winter Has Come', 'Conclua a campanha da Guarda Boreal.': 'Finish the Boreal Guard campaign.',
  'Veneno': 'Venom', 'Conclua a campanha do Cartel Víbora.': 'Finish the Viper Cartel campaign.', 'Perfeccionista': 'Perfectionist', 'Ganhe 3 estrelas em 10 missões.': 'Earn 3 stars in 10 missions.',
  'Mãos Leves': 'Light Fingers', 'Capture uma construção inimiga com um Engenheiro.': 'Capture an enemy building with an Engineer.', 'Fim do Mundo': 'End of the World', 'Use o superpoder do seu exército.': "Use your army's superweapon.",
  'Veterano de Guerra': 'War Veteran', 'Promova uma unidade a Elite.': 'Promote a unit to Elite.', 'Grande Muralha': 'Great Wall', 'Tenha 30 trechos de muro numa partida.': 'Have 30 wall segments in one match.',
  'Máquina de Guerra': 'War Machine', 'Some 250 abates no total.': 'Reach 250 total kills.', 'Gráficos ajustados automaticamente para manter a fluidez': 'Graphics adjusted automatically to keep things smooth',
  '🎙 Locutor e vozes': '🎙 Announcer and voices', 'Desligado': 'Off', 'Ligado': 'On', 'Todos os engenheiros caíram.': 'All engineers have fallen.', 'O comboio foi destruído.': 'The convoy was destroyed.',
  'Escolha seu exército': 'Choose your army', 'Vanguarda Solar': 'Solar Vanguard', 'Sindicato Ferro': 'Iron Syndicate',
  'Vanguarda Solar × Sindicato Ferro': 'Solar Vanguard × Iron Syndicate', 'FRENTE DE': 'IRON', 'FERRO': 'FRONT',
  'Frente de Ferro': 'Iron Front', 'Dificuldade da IA': 'AI difficulty', 'Fácil': 'Easy', 'Normal': 'Normal', 'Difícil': 'Hard',
  'Mapa': 'Map', '▶ Jogar Escaramuça': '▶ Play Skirmish', '🌐 Jogar Online 1x1': '🌐 Play Online 1v1', '🎖 Campanha': '🎖 Campaign',
  '🔊 Configurações de Áudio': '🔊 Audio & Settings', 'Vitórias:': 'Wins:', '· Derrotas:': '· Losses:',
  'Áudio': 'Audio & Settings', 'Volume': 'Volume', 'Música': 'Music', 'Gráficos': 'Graphics', 'Idioma': 'Language',
  'Automático': 'Automatic', 'Baixo (economiza bateria)': 'Low (saves battery)', 'Médio': 'Medium', 'Alto (bloom e sombras)': 'High (bloom & shadows)',
  'Edição Completa': 'Full Edition', 'Compra única · sem anúncios · sem assinatura': 'One-time purchase · no ads · no subscription',
  'Agora não': 'Not now', 'Restaurar compra': 'Restore purchase', 'Processando…': 'Processing…',
  'Modo de teste: nenhuma cobrança real.': 'Test mode: no real charge.', '✔ Edição Completa desbloqueada!': '✔ Full Edition unlocked!',
  '🔥 Todos os próximos capítulos e missões, sem pagar de novo': '🔥 All future chapters and missions, no extra payment',
  '⭐ Recompensas de 3 estrelas em todas as fases': '⭐ 3-star rewards on every mission',
  '📱 Vale no seu aparelho; restaure em outro com 1 toque': '📱 Works on your device; restore on another with 1 tap',
  'Nenhuma compra encontrada nesta conta.': 'No purchase found on this account.',
  'Compra indisponível nesta versão. Atualize o aplicativo.': 'Purchase unavailable in this version. Please update the app.',
  'A compra não foi concluída.': 'The purchase was not completed.', 'Não foi possível restaurar agora.': 'Could not restore right now.',
  'DUPLA ELIMINAÇÃO': 'DOUBLE KILL', 'TRIPLA ELIMINAÇÃO!': 'TRIPLE KILL!', 'QUÁDRUPLA ELIMINAÇÃO!': 'QUAD KILL!',
  'SEQUÊNCIA IMPARÁVEL!': 'UNSTOPPABLE!', 'MASSACRE!': 'MASSACRE!', 'LENDÁRIO!': 'LEGENDARY!',
  'ESTRUTURA INIMIGA DESTRUÍDA': 'ENEMY STRUCTURE DESTROYED', '⚠ BASE SOB ATAQUE!': '⚠ BASE UNDER ATTACK!',
  'Ano 0': 'Year 0',
  'Ano 14': 'Year 14',
  'Ano 31': 'Year 31',
  'Ano 33': 'Year 33',
  'Ano 34': 'Year 34',
  'Ano 34, dia 41': 'Year 34, day 41',
  'O Cristal': 'The Crystal',
  'A Companhia': 'The Company',
  'O Relatório Arruda': 'The Arruda Report',
  'O Tratado que não nasceu': 'The Treaty That Never Was',
  'O Apagão': 'The Blackout',
  'O primeiro tiro': 'The First Shot',
  'Na Grande Planície brotou o Cristal de Cobalto: uma pedra azul que guarda energia e a devolve sem fumaça. Em uma geração, as cidades deixaram o carvão para trás. Aurora, a cidade dos painéis solares, prometeu que ninguém mais passaria frio no escuro.': 'On the Great Plain the Cobalt Crystal sprouted: a blue stone that stores energy and gives it back without smoke. Within a generation, cities left coal behind. Aurora, the city of solar panels, promised that no one would ever sit cold in the dark again.',
  'Quem tinha máquinas para cavar ficou rico. A Companhia Ferro-Cobalto, dona das minas, passou a vender energia a quem pagasse. O Concílio de Aurora, que dependia dessa energia, aceitou fechar os olhos: "A Companhia gera empregos. Um problema por vez."': 'Whoever owned digging machines got rich. The Iron-Cobalt Company, owner of the mines, began selling energy to anyone who could pay. The Aurora Council, which depended on that energy, chose to look away: "The Company creates jobs. One problem at a time."',
  'A engenheira Helena Arruda mediu os campos e alertou: a Companhia retirava cristal mais rápido do que a terra o recriava, e o campo central de Meridiana estava instável. Pediu cotas e inspeção. O Concílio engavetou o relatório, pois as campanhas de seus membros eram pagas pela Companhia. A Companhia chamou o laudo de "alarmismo solar" e comprou um laudo contrário.': 'Engineer Helena Arruda surveyed the fields and warned: the Company was extracting crystal faster than the land could regrow it, and the central Meridiana field was unstable. She asked for quotas and inspections. The Council shelved the report, since its members\' campaigns were paid by the Company. The Company called it "solar alarmism" and bought a contrary report.',
  'Em Rio das Garças, mediadores propuseram um tratado de cotas compartilhadas. Aurora exigiu inspeção total; a Companhia exigiu o controle das minas. Ninguém cedeu. O texto ficou sem assinatura e os dois lados voltaram para casa dizendo que o outro havia abandonado a mesa.': 'At Rio das Garças, mediators proposed a shared-quota treaty. Aurora demanded full inspection; the Company demanded control of the mines. Nobody gave way. The text stayed unsigned and both sides went home saying the other had walked away from the table.',
  'Meridiana colapsou. Em nove dias, a energia da Planície inteira se apagou. Hospitais, bombas d\'água e fábricas pararam. A Companhia salvou apenas as suas minas e vendeu o resto da energia a preço de resgate. Aurora respondeu requisitando os campos do sul. Cada lado jurava defender o povo; cada lado acusava o outro de ter causado tudo.': 'Meridiana collapsed. Within nine days the whole Plain\'s power went dark. Hospitals, water pumps and factories stopped. The Company saved only its own mines and sold the rest of the energy at ransom prices. Aurora answered by requisitioning the southern fields. Each side swore to defend the people; each blamed the other for everything.',
  'Um comboio da Companhia entrou nos Campos da Aurora para "recuperar equipamento". A Guarda Solar bloqueou a estrada. Ninguém sabe quem atirou primeiro, e a verdade nunca mais importou. Naquela noite, nasceram a Vanguarda Solar e o Sindicato Ferro. Você é o comandante que foi chamado para terminar a guerra que todos ajudaram a começar.': 'A Company convoy entered the Aurora Fields to "recover equipment". The Solar Guard blocked the road. Nobody knows who fired first, and the truth stopped mattering. That night the Solar Vanguard and the Iron Syndicate were born. You are the commander called to end a war everyone helped start.',
  'O Concílio engavetou um alerta técnico para não perder doações.': 'The Council shelved a technical warning to avoid losing donations.',
  'A Companhia comprou um laudo falso em vez de reduzir a extração.': 'The Company bought a false report instead of reducing extraction.',
  'Ninguém assinou o Tratado de Rio das Garças: a desconfiança valeu mais que a água e a luz.': 'Nobody signed the Rio das Garças Treaty: distrust was worth more than water and light.',
  'Os dois lados armaram milícias "só por precaução" antes de a primeira crise chegar.': 'Both sides armed militias "just in case" before the first crisis even arrived.',
  'Quem poderia ter evitado?': 'Who could have prevented it?',
  'A guerra não começou com um tiro. Começou com cada aviso ignorado.': 'The war did not start with a shot. It started with every warning ignored.',
  'Pular': 'Skip',
  'Continuar ▶': 'Continue ▶',
  'Fim ▶': 'End ▶',
  'Entrar na campanha': 'Enter the campaign',
  '📜 A Origem da Guerra': '📜 Origin of the War',
  'Reparar': 'Repair',
  'Reunião': 'Rally',
  'Poder': 'Power',
  'PRONTO': 'READY',
  'Selecione uma construção para reparar': 'Select a building to repair',
  'Construção já está com a vida cheia': 'Building is already at full health',
  'Reparo em recarga': 'Repair on cooldown',
  'O superpoder requer uma Central de Radar': 'The superpower requires a Radar Center',
  'Toque no alvo do Pulso Solar': 'Tap the Solar Pulse target',
  'Toque no alvo da Barragem de Artilharia': 'Tap the Artillery Barrage target',
  'Toque no mapa: ponto de reunião das novas tropas': 'Tap the map: rally point for new troops',
  '☀ Pulso Solar lançado!': '☀ Solar Pulse launched!',
  '💥 Barragem de Artilharia iniciada!': '💥 Artillery Barrage started!',
  '☀ PULSO SOLAR': '☀ SOLAR PULSE',
  '💥 BARRAGEM DE ARTILHARIA': '💥 ARTILLERY BARRAGE',
  'T:Reparar construção selecionada (custa 12% do valor)': 'Repair selected building (costs 12% of its value)',
  'T:Ponto de reunião: novas tropas vão para lá': 'Rally point: new troops go there',
  'T:Superpoder (exige Central de Radar)': 'Superpower (requires Radar Center)',
  'Fim da demo': 'End of demo', 'Obrigado por testar o Frente de Ferro!': 'Thanks for testing Iron Front!',
  '🎖 O jogo completo terá 8+ missões, superpoderes, online 1x1 e novas campanhas.': '🎖 The full game will have 8+ missions, superpowers, 1v1 online and new campaigns.',
  'Conte ao Brunno: o que foi divertido? O que travou ou confundiu?': 'Tell Brunno: what was fun? What got stuck or confusing?',
  '📋 Copiar meu resultado': '📋 Copy my result', '✔ Copiado! Cole no WhatsApp': '✔ Copied! Paste in WhatsApp', '↻ Jogar de novo': '↻ Play again', '🏁 Concluir demo': '🏁 Finish demo',
  'DEMO: 2 missões para você testar.': 'DEMO: 2 missions for you to test.',
  'Silenciar tudo': 'Mute all', 'Testar som': 'Test sound', 'Fechar': 'Close', 'Voltar': 'Back',
  'Gire o aparelho para o modo paisagem': 'Rotate your device to landscape',
  'Partida Online 1x1': 'Online Match 1v1', 'Crie uma sala e envie o convite ao seu amigo, ou entre com o código que recebeu.': 'Create a room and send the invite to your friend, or join with the code you received.',
  '✉ Criar sala e convidar': '✉ Create room & invite', 'Tenho um código': 'I have a code', 'Entrar': 'Join',
  '✔ Link copiado! Cole no WhatsApp ou onde preferir.': '✔ Link copied! Paste it in your messenger of choice.', 'Copie o link do convite:': 'Copy the invite link:',
  '✔ Conectado! Aguardando o anfitrião iniciar…': '✔ Connected! Waiting for the host to start…', '⚠ Erro de conexão: ': '⚠ Connection error: ',
  'Tempo esgotado: não foi possível conectar à sala.': 'Timed out: could not connect to the room.', 'Sala não encontrada. Confira o código.': 'Room not found. Check the code.', 'erro de rede': 'network error',
  // campanha
  'Campanha · Vanguarda Solar': 'Campaign · Solar Vanguard', 'Derrote o Sindicato Ferro em 8 missões. Termine rápido para ganhar até 3 estrelas.': 'Defeat the Iron Syndicate in 8 missions. Finish fast to earn up to 3 stars.',
  'Objetivos': 'Objectives', '▶ Iniciar missão': '▶ Start mission', 'ativa': 'active', 'roteirizada': 'scripted',
  'Tutorial': 'Tutorial', 'Economia': 'Economy', 'Ataque': 'Attack', 'Defesa': 'Defense', 'Ar': 'Air', 'Escaramuça': 'Skirmish', 'Assalto': 'Assault', 'Batalha final': 'Final battle',
  'Primeiro Contato': 'First Contact', 'Cristais da Aurora': 'Dawn Crystals', 'Posto Avançado': 'Outpost', 'A Barragem': 'The Barrage', 'Céus de Ferro': 'Iron Skies',
  'Guerra no Rio': 'River War', 'Muralha de Aço': 'Steel Wall',
  'Comandante, bem-vindo à Vanguarda Solar. Nossa base na Planície Verde está montada, mas precisa crescer. Aprenda a mover a câmera, comandar tropas, construir e evoluir. Uma patrulha do Sindicato Ferro se aproxima: esteja pronto.':
    'Commander, welcome to the Solar Vanguard. Our base on the Green Plain is set up but needs to grow. Learn to move the camera, command troops, build and upgrade. An Iron Syndicate patrol is approaching: be ready.',
  'Sem cristais não há exército. Os campos ao redor da base estão ricos, mas o Sindicato também os quer. Expanda a coleta e mantenha a base de pé.':
    'No crystals, no army. The fields around the base are rich, but the Syndicate wants them too. Expand harvesting and keep your base standing.',
  'O Sindicato ergueu um posto avançado a nordeste para vigiar nosso território. Você tem um esquadrão blindado. Elimine o posto antes que chegue reforço.':
    'The Syndicate has built an outpost to the northeast to watch our territory. You have an armored squad. Eliminate the outpost before reinforcements arrive.',
  'Informações indicam seis ondas de assalto contra nossa base. Não há tempo para atacar: construa defesas, mantenha a economia e segure a linha.':
    'Intel points to six assault waves against our base. No time to attack: build defenses, keep the economy running and hold the line.',
  'Nossa melhor chance é pelo ar. Quatro helicópteros e um heliporto estão à disposição. Derrube as usinas e a refinaria do Sindicato para sufocar a economia deles. Cuidado com as torres antiaéreas.':
    'Our best chance is by air. Four helicopters and a helipad are at your disposal. Bring down the Syndicate\'s power plants and refinery to choke their economy. Beware of anti-air towers.',
  'O Sindicato aproveita o terreno alagado. Domine as passagens e destrua a base inimiga com todos os recursos de que dispõe.':
    'The Syndicate is using the flooded terrain. Take the crossings and destroy the enemy base with every resource you have.',
  'O quartel-general do Sindicato é uma fortaleza cheia de torres. Tanques Prisma têm alcance e poder para quebrar a muralha, mas precisam de cobertura. Planeje o ataque.':
    'The Syndicate headquarters is a fortress full of towers. Prism Tanks have the range and power to break the wall, but need cover. Plan your attack.',
  'Última frente. O Sindicato lança tudo o que tem nos Cânions do Sul. Use economia, defesa e tecnologia: esta batalha decide a guerra.':
    'Final front. The Syndicate throws everything it has at the Southern Canyons. Use economy, defense and technology: this battle decides the war.',
  // objetivos
  'Mova a câmera': 'Move the camera', 'Selecione um Fuzileiro': 'Select a Rifleman', 'Mande-o andar até um ponto vazio': 'Send it to an empty spot',
  'Construa um Gerador de Energia': 'Build a Power Generator', 'Construa um Quartel': 'Build a Barracks', 'Treine 3 Fuzileiros': 'Train 3 Riflemen',
  'Construa uma Fábrica de Blindados': 'Build an Armor Factory', 'Treine um Tanque': 'Train a Tank', 'Evolua uma unidade ou construção ★': 'Upgrade a unit or building ★',
  'Destrua a patrulha inimiga ao norte': 'Destroy the enemy patrol to the north', 'Colete 3.500 créditos de cristal': 'Harvest 3,500 crystal credits', 'Tenha 2 Refinarias': 'Own 2 Refineries',
  'Destrua o Posto Avançado do Sindicato': 'Destroy the Syndicate Outpost', 'Resista às 6 ondas inimigas': 'Survive the 6 enemy waves',
  'Destrua as Usinas de Energia inimigas': 'Destroy the enemy Power Plants', 'Destrua a Refinaria inimiga': 'Destroy the enemy Refinery',
  'Destrua todas as construções inimigas': 'Destroy all enemy buildings', 'Destrua a Fortaleza inimiga': 'Destroy the enemy Fortress',
  'PC: botão do meio, WASD, setas ou encoste o mouse na borda. Celular: arraste com dois dedos.': 'PC: middle mouse button, WASD, arrows or push the mouse to the screen edge. Phone: drag with two fingers.',
  'Toque nele ou arraste uma caixa de seleção (botão Caixa no celular).': 'Tap it or drag a selection box (Box button on phones).',
  'PC: clique com o botão direito. Celular: toque no destino.': 'PC: right-click. Phone: tap the destination.',
  'Aba Base → Gerador. Quando chegar a 100%, toque no ícone de novo e posicione no mapa.': 'Base tab → Generator. At 100%, tap the icon again and place it on the map.',
  'Quartéis liberam a infantaria. Posicione perto da base.': 'Barracks unlock infantry. Place it near your base.',
  'Aba Infantaria → Fuzileiro. Toque várias vezes para enfileirar.': 'Infantry tab → Rifleman. Tap several times to queue.',
  'A fábrica libera veículos e tanques.': 'The factory unlocks vehicles and tanks.', 'Aba Veículos → Tanque.': 'Vehicles tab → Tank.',
  'Selecione o tanque (ou um prédio) e toque em Evoluir. Unidades também ganham patentes ao abater inimigos.': 'Select the tank (or a building) and tap Upgrade. Units also earn ranks by killing enemies.',
  'Selecione suas tropas (botão Exército) e toque nos inimigos para atacar. A tecla A ataca em movimento.': 'Select your troops (Army button) and tap enemies to attack. The A key attack-moves.',
  'Alerta: patrulha inimiga a noroeste!': 'Alert: enemy patrol to the northwest!', 'Sua base foi destruída.': 'Your base was destroyed.', 'O Centro de Comando caiu.': 'The Command Center has fallen.', 'Última onda!': 'Final wave!',
  // hud / jogo
  'Caixa': 'Box', 'Exército': 'Army', 'Limpar': 'Clear', 'Atacar': 'Attack', 'Parar': 'Stop', 'Vender': 'Sell', 'Base': 'Base', 'Infantaria': 'Infantry', 'Veículos': 'Vehicles', 'Aéreo': 'Air',
  'T:Atacar-mover: toque no destino': 'T:Attack-move: tap the destination', 'T:Caixa de seleção': 'T:Selection box', 'T:Energia': 'T:Power', 'T:Limpar seleção': 'T:Clear selection',
  'T:Pausa': 'T:Pause', 'T:Selecionar todo o exército': 'T:Select entire army', 'T:Vender construção selecionada (50%)': 'T:Sell selected building (50%)',
  'T:Parar': 'T:Stop', 'T:Base': 'T:Base', 'T:Infantaria': 'T:Infantry', 'T:Veículos': 'T:Vehicles', 'T:Aéreo': 'T:Air', 'T:Vanguarda Solar': 'T:Solar Vanguard',
  'Pausa': 'Pause', 'Pausado': 'Paused', 'Menu': 'Menu', 'A partida está em pausa.': 'The match is paused.', 'A partida online continua em andamento.': 'The online match is still running.',
  '▶ Continuar': '▶ Resume', '⟲ Sair da partida': '⟲ Leave match', '☰ Campanha': '☰ Campaign', '↻ Tentar de novo': '↻ Try again',
  'MISSÃO CUMPRIDA': 'MISSION COMPLETE', 'MISSÃO FALHOU': 'MISSION FAILED', 'VITÓRIA!': 'VICTORY!', 'DERROTA': 'DEFEAT',
  'Missão cumprida! A próxima já está liberada.': 'Mission complete! The next one is unlocked.', 'Campanha concluída! A Vanguarda Solar venceu a guerra.': 'Campaign complete! The Solar Vanguard won the war.', 'A missão falhou.': 'The mission failed.',
  'Todas as construções inimigas foram destruídas.': 'All enemy buildings were destroyed.',
  '✔ Construir': '✔ Build', '✖ Cancelar': '✖ Cancel', 'Conexão encerrada': 'Connection closed', 'Seu amigo saiu da partida. Você vence por abandono!': 'Your friend left the match. You win by forfeit!',
  'Sem espaço disponível perto da base': 'No space available near the base', 'Toque no mapa para mover; toque no prédio (ou ✔) para construir': 'Tap the map to move; tap the building (or ✔) to build',
  'Local inválido: perto da base e em terreno livre': 'Invalid spot: must be near your base on free ground', 'Local inválido': 'Invalid spot', 'Toque no destino: as tropas atacam tudo pelo caminho': 'Tap the destination: troops attack everything on the way',
  'Selecione uma construção (exceto o Centro de Comando)': 'Select a building (except the Command Center)', 'O Nível 3 requer um Laboratório Tecnológico': 'Level 3 requires a Tech Lab',
  'Nível máximo': 'Max level', 'Créditos insuficientes': 'Not enough credits', 'Nenhuma tropa de combate': 'No combat troops', 'Nível 3 exige Laboratório': 'Level 3 needs a Lab',
  'Mais abates = promoção automática': 'More kills = automatic promotion', 'Nada a evoluir': 'Nothing to upgrade', 'Requisito não atendido': 'Requirement not met',
  'Já há uma construção em andamento': 'A building is already in progress', 'Alvo inválido': 'Invalid target', '⚠ Tropas inimigas avançando!': '⚠ Enemy troops advancing!',
  '⚠ Energia baixa! Construa ou evolua um Gerador.': '⚠ Low power! Build or upgrade a Generator.',
  'Clique numa construção/unidade para evoluir ★ · Atalhos: A atacar, S parar, U evoluir, H base, Espaço alerta': 'Click a building/unit to upgrade ★ · Hotkeys: A attack, S stop, U upgrade, H base, Space alert',
  'Partida online 1x1 — destrua a base do seu amigo!': 'Online 1v1 match — destroy your friend\'s base!',
  'Vida': 'Health', 'Dano': 'Damage', 'Alcance': 'Range', 'Velocidade': 'Speed', 'Abates': 'Kills', 'só aéreos': 'air only', 'só terrestres': 'ground only',
  // construções / unidades
  'Centro de Comando': 'Command Center', 'Gerador': 'Generator', 'Refinaria': 'Refinery', 'Quartel': 'Barracks', 'Fábrica de Blindados': 'Armor Factory', 'Torre Laser': 'Laser Tower',
  'Torre Antiaérea': 'Anti-Air Tower', 'Central de Radar': 'Radar Station', 'Laboratório Tecnológico': 'Tech Lab', 'Heliporto': 'Helipad', 'Muro Reforçado': 'Reinforced Wall',
  'Lança-Foguetes': 'Rocket Trooper', 'Atirador de Elite': 'Sniper', 'Jipe Batedor': 'Scout Buggy', 'Tanque Pesado': 'Heavy Tank', 'Artilharia Pesada': 'Heavy Artillery',
  'Tanque Prisma': 'Prism Tank', 'Helicóptero de Ataque': 'Attack Helicopter', 'Extrator': 'Harvester', 'Fuzileiro': 'Rifleman',
  'Núcleo da base: constrói as demais estruturas. Não pode ser vendido.': 'Base core: builds all other structures. Cannot be sold.',
  'Gera energia (+100). Sem energia a produção cai pela metade e o radar desliga.': 'Generates power (+100). Without power, production halves and the radar shuts down.',
  'Converte Cristal de Cobalto em créditos. Vem com 1 Extrator grátis.': 'Converts Cobalt Crystal into credits. Comes with 1 free Harvester.',
  'Treina infantaria: fuzileiros, lança-foguetes e atiradores de elite.': 'Trains infantry: riflemen, rocket troopers and snipers.',
  'Produz veículos: Extratores, jipes, tanques e artilharia.': 'Produces vehicles: harvesters, buggies, tanks and artillery.',
  'Defesa fixa de laser contra alvos terrestres.': 'Fixed laser defense against ground targets.',
  'Mísseis antiaéreos: só atinge aeronaves, com grande eficácia.': 'Anti-air missiles: hits aircraft only, very effectively.',
  'Amplia muito a visão do mapa e libera tecnologia avançada.': 'Greatly extends map vision and unlocks advanced technology.',
  'Libera unidades de elite e a evolução para o Nível 3.': 'Unlocks elite units and Level 3 upgrades.', 'Produz aeronaves de ataque.': 'Produces attack aircraft.',
  'Bloqueia a passagem inimiga. Barato e resistente.': 'Blocks the enemy\'s path. Cheap and sturdy.',
  'Soldado básico, barato e eficaz contra outra infantaria.': 'Basic soldier, cheap and effective against other infantry.',
  'Anti-blindado e antiaéreo. Frágil contra infantaria.': 'Anti-armor and anti-air. Weak against infantry.',
  'Alcance enorme e dano alto contra infantaria. Muito frágil.': 'Huge range and high damage against infantry. Very fragile.',
  'Veículo rápido de reconhecimento com metralhadora. Ótimo para flanquear.': 'Fast recon vehicle with a machine gun. Great for flanking.',
  'Espinha dorsal do exército: resistente e forte contra tudo no solo.': 'Backbone of the army: sturdy and strong against everything on the ground.',
  'Exclusiva do Sindicato Ferro. Bombardeio de longo alcance com dano em área.': 'Iron Syndicate exclusive. Long-range bombardment with area damage.',
  'Exclusivo da Vanguarda Solar. Blindagem pesada e feixe solar devastador.': 'Solar Vanguard exclusive. Heavy armor and a devastating solar beam.',
  'Aeronave veloz que ignora o terreno. Só tropas antiaéreas e fuzileiros o atingem.': 'Fast aircraft that ignores terrain. Only anti-air and riflemen can hit it.',
  'Coleta Cristal de Cobalto sozinho e leva à Refinaria.': 'Harvests Cobalt Crystal on its own and delivers it to the Refinery.',
  'Blindados pesados e energia limpa: +20% blindagem, +30% energia, Tanque Prisma exclusivo.': 'Heavy armor and clean energy: +20% armor, +30% power, exclusive Prism Tank.',
  'Velocidade e artilharia: +20% velocidade e alcance, Artilharia Pesada exclusiva.': 'Speed and artillery: +20% speed and range, exclusive Heavy Artillery.',
  // mapas
  'Vale Verde': 'Green Valley', 'Crateras de Ferro': 'Iron Craters', 'Rio das Garças': 'Heron River', 'Mar de Dunas': 'Dune Sea', 'Cânions do Sul': 'Southern Canyons',
  'Campos verdes com estrada central, ideal para começar.': 'Green fields with a central road, ideal to start.', 'Obstáculos densos e rotas estreitas.': 'Dense obstacles and narrow routes.',
  'Lagos e pontes naturais: o controle do centro decide.': 'Lakes and natural bridges: controlling the center decides.', 'Deserto aberto com poucos abrigos: movimento rápido vence.': 'Open desert with little cover: fast movement wins.',
  'Labirinto de rochas: defesa vale ouro.': 'Rock maze: defense is gold.',
};

/** Regras para textos dinâmicos. */
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Missão (\d+) · (.+)$/, m => `Mission ${m[1]} · ${tr(m[2])}`],
  [/^Missão (\d+): (.+)$/, m => `Mission ${m[1]}: ${tr(m[2])}`],
  [/^Missão (\d+)$/, m => `Mission ${m[1]}`],
  [/^· Fácil (\d+) \/ Normal (\d+) \/ Difícil (\d+)$/, m => `· Easy ${m[1]} / Normal ${m[2]} / Hard ${m[3]}`],
  [/^💡 (.+)$/, m => `💡 ${tr(m[1])}`],
  [/^· (.+)$/, m => `· ${tr(m[1])}`],
  [/^(.+) · IA (ativa|roteirizada) · (.+)$/, m => `${tr(m[1])} · AI ${tr(m[2])} · ${tr(m[3])}`],
  [/^IA (.+): ataca quando reunir tropas — não há cronômetro\. Fique atento!$/, m => `${tr(m[1])} AI: attacks when it gathers troops — there is no timer. Stay alert!`],
  [/^(⏱ )?Onda (\d+)\/(\d+) em (.+)$/, m => `${m[1] ?? ''}Wave ${m[2]}/${m[3]} in ${m[4]}`],
  [/^onda (\d+)\/(\d+)$/, m => `wave ${m[1]}/${m[2]}`],
  [/^Onda (\d+) de (\d+) a caminho!$/, m => `Wave ${m[1]} of ${m[2]} incoming!`],
  [/^(\d+) construções restantes$/, m => `${m[1]} buildings left`],
  [/^(\d+) unidades de combate selecionadas$/, m => `${m[1]} combat units selected`],
  [/^Vendido: \+(\d+) créditos$/, m => `Sold: +${m[1]} credits`],
  [/^(.+): nível máximo$/, m => `${tr(m[1])}: max level`],
  [/^(.+) pronto — toque no mapa para posicionar$/, m => `${tr(m[1])} ready — tap the map to place it`],
  [/^⬆ Evoluir (★?\d+) · (◆\d+)$/, m => `⬆ Upgrade ${m[1]} · ${m[2]}`],
  [/^⬆ Evoluir ★(\d+) · (◆\d+)$/, m => `⬆ Upgrade ★${m[1]} · ${m[2]}`],
  [/^Nível máximo$/, () => 'Max level'],
  [/^(\d+(?:\.\d+)?) tiles$/, m => `${m[1]} tiles`],
  [/^(.+) \(área\)$/, m => `${m[1]} (area)`],
  [/^· Missões 1–(\d+) grátis$/, m => `· Missions 1–${m[1]} free`],
  [/^Superpoder recarregando( \()?(\d+)s\)?$/, m => `Superpower recharging ${m[2]}s`],
  [/^🔓 Desbloquear: (.+)$/, m => `🔓 Unlock: ${tr(m[1])}`],
  [/^MISSÃO (\d+)$/, m => `MISSION ${m[1]}`],
  [/^(\d+) ABATES!$/, m => `${m[1]} KILLS!`],
  [/^▶ Próxima: (.+)$/, m => `▶ Next: ${tr(m[1])}`],
  [/^(★*☆*)? ?·? ?Tempo: (\d+)m(\d+)s · Baixas causadas: (\d+)$/, m => `${m[1] ?? ''}${m[1] ? ' · ' : ''}Time: ${m[2]}m${m[3]}s · Kills: ${m[4]}`],
  [/^Tempo: (\d+)m(\d+)s · Baixas causadas: (\d+)$/, m => `Time: ${m[1]}m${m[2]}s · Kills: ${m[3]}`],
  [/^🔒 (.+) \((\d+) vit\.\)$/, m => `🔒 ${tr(m[1])} (${m[2]} wins)`],
  [/^Entrando na sala (.+)…$/, m => `Joining room ${m[1]}…`],
  [/^◻ (.+)$/, m => `◻ ${tr(m[1])}`],
  [/^✔ (.+)$/, m => `✔ ${tr(m[1])}`],
  [/^Venha jogar Frente de Ferro comigo! Código da sala: (.+)$/, m => `Come play Iron Front with me! Room code: ${m[1]}`],
  [/^⚠ Não foi possível criar a sala \((.+)\)\.$/, m => `⚠ Could not create the room (${tr(m[1])}).`],
  [/^sem conexão$/, () => 'no connection'],
  [/^(.+?)\s+(<em>.*)$/, m => m[0]],
];

let lang: Lang = 'pt';
const cache = new Map<string, string>();

export function tr(s: string): string {
  if (lang === 'pt' || !s) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const key = s.trim();
  let out: string | undefined = D[key];
  if (out === undefined) {
    for (const [re, f] of RULES) { const m = key.match(re); if (m) { out = f(m); break; } }
  }
  if (out === undefined) {
    // "Texto 12" / "Texto: 12": traduz só o prefixo textual
    const m = key.match(/^(.*?)([\s:◆★⚡/0-9.%]+)$/);
    if (m && D[m[1]]) out = D[m[1]] + m[2];
  }
  const res = out === undefined ? s : s.replace(key, out);
  if (cache.size > 4000) cache.clear();
  cache.set(s, res);
  return res;
}

function walk(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const v = n.nodeValue ?? '';
    if (v.trim()) { const t = tr(v); if (t !== v) n.nodeValue = t; }
    return;
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  const el = n as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS') return;
  const ti = el.getAttribute('title');
  if (ti) { const t = tr('T:' + ti); const o = t.startsWith('T:') ? t.slice(2) : tr(ti); if (o !== ti) el.setAttribute('title', o); }
  el.childNodes.forEach(walk);
}

export function initI18n(pref: string | undefined) {
  lang = detectLang(pref);
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  if (lang === 'pt') return;
  const mo = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') walk(m.target);
      else m.addedNodes.forEach(walk);
      if (m.type === 'attributes') walk(m.target);
    }
  });
  walk(document.body);
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
}

export const currentLang = () => lang;
