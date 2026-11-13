export type TechniqueCategory =
  | 'submission'
  | 'sweep'
  | 'guard_pass'
  | 'guard'
  | 'takedown'
  | 'position'
  | 'escape'
  | 'back_take';

export interface Technique {
  slug: string;
  namePt: string;
  nameEn: string;
  category: TechniqueCategory;
  /** Termos falados que indicam a técnica (PT/EN). Prefixo "~" = termo ambíguo (peso menor). */
  aliases: string[];
}

export const CATEGORY_LABEL_PT: Record<TechniqueCategory, string> = {
  submission: 'Finalização',
  sweep: 'Raspagem',
  guard_pass: 'Passagem de guarda',
  guard: 'Guarda',
  takedown: 'Queda',
  position: 'Posição',
  escape: 'Saída / fuga',
  back_take: 'Pegada de costas',
};

export const TECHNIQUES: Technique[] = [
  // Finalizações
  { slug: 'armbar', namePt: 'Chave de braço', nameEn: 'Armbar', category: 'submission', aliases: ['armbar', 'arm bar', 'chave de braco', 'juji gatame', 'juji-gatame', 'armlock'] },
  { slug: 'triangle-choke', namePt: 'Triângulo', nameEn: 'Triangle choke', category: 'submission', aliases: ['triangle choke', 'triangulo', 'sankaku', '~triangle'] },
  { slug: 'kimura', namePt: 'Kimura', nameEn: 'Kimura', category: 'submission', aliases: ['kimura', 'ude garami reverso'] },
  { slug: 'americana', namePt: 'Americana', nameEn: 'Americana', category: 'submission', aliases: ['americana', 'keylock', 'key lock', 'ude garami'] },
  { slug: 'omoplata', namePt: 'Omoplata', nameEn: 'Omoplata', category: 'submission', aliases: ['omoplata', 'omo plata'] },
  { slug: 'rear-naked-choke', namePt: 'Mata-leão', nameEn: 'Rear naked choke', category: 'submission', aliases: ['mata leao', 'rear naked choke', 'rnc', 'hadaka jime'] },
  { slug: 'guillotine', namePt: 'Guilhotina', nameEn: 'Guillotine', category: 'submission', aliases: ['guilhotina', 'guillotine'] },
  { slug: 'darce', namePt: "D'Arce", nameEn: "D'Arce choke", category: 'submission', aliases: ['darce', 'd arce', 'brabo choke'] },
  { slug: 'anaconda', namePt: 'Anaconda', nameEn: 'Anaconda choke', category: 'submission', aliases: ['anaconda'] },
  { slug: 'arm-triangle', namePt: 'Katagatame (triângulo de braço)', nameEn: 'Arm triangle', category: 'submission', aliases: ['arm triangle', 'katagatame', 'kata gatame', 'triangulo de braco', 'head and arm choke'] },
  { slug: 'ezekiel', namePt: 'Ezequiel', nameEn: 'Ezekiel choke', category: 'submission', aliases: ['ezequiel', 'ezekiel', 'sode guruma jime'] },
  { slug: 'cross-collar-choke', namePt: 'Estrangulamento cruzado', nameEn: 'Cross collar choke', category: 'submission', aliases: ['cross collar choke', 'cross choke', 'estrangulamento cruzado', 'gola cruzada', 'juji jime'] },
  { slug: 'bow-and-arrow', namePt: 'Arco e flecha', nameEn: 'Bow and arrow choke', category: 'submission', aliases: ['bow and arrow', 'arco e flecha'] },
  { slug: 'loop-choke', namePt: 'Loop choke', nameEn: 'Loop choke', category: 'submission', aliases: ['loop choke'] },
  { slug: 'clock-choke', namePt: 'Relógio', nameEn: 'Clock choke', category: 'submission', aliases: ['clock choke', 'estrangulamento relogio', 'estrangulamento do relogio'] },
  { slug: 'baseball-bat-choke', namePt: 'Taco de beisebol', nameEn: 'Baseball bat choke', category: 'submission', aliases: ['baseball bat choke', 'baseball choke', 'taco de beisebol'] },
  { slug: 'north-south-choke', namePt: 'Estrangulamento norte-sul', nameEn: 'North-south choke', category: 'submission', aliases: ['north south choke', 'estrangulamento norte sul'] },
  { slug: 'heel-hook', namePt: 'Chave de calcanhar', nameEn: 'Heel hook', category: 'submission', aliases: ['heel hook', 'heelhook', 'chave de calcanhar', 'inside heel hook', 'outside heel hook'] },
  { slug: 'kneebar', namePt: 'Chave de joelho', nameEn: 'Kneebar', category: 'submission', aliases: ['kneebar', 'knee bar', 'chave de joelho'] },
  { slug: 'straight-ankle-lock', namePt: 'Chave de pé reta', nameEn: 'Straight ankle lock', category: 'submission', aliases: ['straight ankle lock', 'ankle lock', 'chave de pe', 'chave de tornozelo', 'footlock', 'foot lock'] },
  { slug: 'toe-hold', namePt: 'Mão de vaca', nameEn: 'Toe hold', category: 'submission', aliases: ['toe hold', 'toehold', 'mao de vaca'] },
  { slug: 'calf-slicer', namePt: 'Chave de panturrilha', nameEn: 'Calf slicer', category: 'submission', aliases: ['calf slicer', 'calf crusher', 'chave de panturrilha'] },
  { slug: 'bicep-slicer', namePt: 'Chave de bíceps', nameEn: 'Bicep slicer', category: 'submission', aliases: ['bicep slicer', 'biceps slicer', 'chave de biceps'] },
  { slug: 'wrist-lock', namePt: 'Mão de vaca (punho)', nameEn: 'Wrist lock', category: 'submission', aliases: ['wrist lock', 'wristlock', 'chave de punho'] },

  // Raspagens
  { slug: 'scissor-sweep', namePt: 'Raspagem de tesoura', nameEn: 'Scissor sweep', category: 'sweep', aliases: ['scissor sweep', 'raspagem de tesoura', 'raspagem tesoura'] },
  { slug: 'hip-bump-sweep', namePt: 'Raspagem de quadril', nameEn: 'Hip bump sweep', category: 'sweep', aliases: ['hip bump', 'raspagem de quadril', 'sit up sweep'] },
  { slug: 'flower-sweep', namePt: 'Raspagem de pêndulo', nameEn: 'Flower sweep', category: 'sweep', aliases: ['flower sweep', 'pendulum sweep', 'raspagem de pendulo', 'raspagem pendulo'] },
  { slug: 'tripod-sweep', namePt: 'Raspagem tripé', nameEn: 'Tripod sweep', category: 'sweep', aliases: ['tripod sweep', 'raspagem tripe', 'raspagem de tripe'] },
  { slug: 'sickle-sweep', namePt: 'Raspagem foice', nameEn: 'Sickle sweep', category: 'sweep', aliases: ['sickle sweep', 'raspagem foice', 'raspagem de foice'] },
  { slug: 'butterfly-sweep', namePt: 'Raspagem de borboleta', nameEn: 'Butterfly sweep', category: 'sweep', aliases: ['butterfly sweep', 'hook sweep', 'raspagem de gancho', 'raspagem de borboleta'] },
  { slug: 'elevator-sweep', namePt: 'Raspagem elevador', nameEn: 'Elevator sweep', category: 'sweep', aliases: ['elevator sweep', 'raspagem elevador'] },
  { slug: 'waiter-sweep', namePt: 'Raspagem garçom', nameEn: 'Waiter sweep', category: 'sweep', aliases: ['waiter sweep', 'raspagem garcom'] },
  { slug: 'berimbolo', namePt: 'Berimbolo', nameEn: 'Berimbolo', category: 'sweep', aliases: ['berimbolo'] },
  { slug: 'kiss-of-the-dragon', namePt: 'Beijo do dragão', nameEn: 'Kiss of the dragon', category: 'sweep', aliases: ['kiss of the dragon', 'beijo do dragao'] },

  // Guardas
  { slug: 'closed-guard', namePt: 'Guarda fechada', nameEn: 'Closed guard', category: 'guard', aliases: ['closed guard', 'guarda fechada', 'full guard'] },
  { slug: 'half-guard', namePt: 'Meia-guarda', nameEn: 'Half guard', category: 'guard', aliases: ['half guard', 'meia guarda', 'deep half', 'meia guarda profunda'] },
  { slug: 'butterfly-guard', namePt: 'Guarda borboleta', nameEn: 'Butterfly guard', category: 'guard', aliases: ['butterfly guard', 'guarda borboleta', 'guarda de gancho'] },
  { slug: 'de-la-riva', namePt: 'De La Riva', nameEn: 'De La Riva guard', category: 'guard', aliases: ['de la riva', 'dlr', 'delariva', 'della riva', 'dela riva', 'de la reva', 'de la rive'] },
  { slug: 'reverse-de-la-riva', namePt: 'De La Riva invertida', nameEn: 'Reverse De La Riva', category: 'guard', aliases: ['reverse de la riva', 'rdlr', 'de la riva invertida', 'reverse della', 'reverse dela', 'reverse della riva', 'reverse dlr', 'reverse de la reva'] },
  { slug: 'spider-guard', namePt: 'Guarda aranha', nameEn: 'Spider guard', category: 'guard', aliases: ['spider guard', 'guarda aranha', 'spider', 'aranha'] },
  { slug: 'lasso-guard', namePt: 'Guarda laço', nameEn: 'Lasso guard', category: 'guard', aliases: ['lasso guard', 'lasso', 'guarda laco'] },
  { slug: 'x-guard', namePt: 'Guarda X', nameEn: 'X-guard', category: 'guard', aliases: ['x guard', 'guarda x'] },
  { slug: 'single-leg-x', namePt: 'Single leg X (Ashi)', nameEn: 'Single leg X', category: 'guard', aliases: ['single leg x', 'slx', 'ashi garami', 'ashi'] },
  { slug: 'fifty-fifty', namePt: '50/50', nameEn: '50/50 guard', category: 'guard', aliases: ['fifty fifty', '50 50', 'cinquenta cinquenta'] },
  { slug: 'worm-guard', namePt: 'Guarda lapela (worm)', nameEn: 'Worm / lapel guard', category: 'guard', aliases: ['worm guard', 'lapel guard', 'guarda lapela', 'guarda de lapela'] },
  { slug: 'k-guard', namePt: 'Guarda K', nameEn: 'K-guard', category: 'guard', aliases: ['k guard', 'guarda k'] },
  { slug: 'rubber-guard', namePt: 'Guarda de borracha', nameEn: 'Rubber guard', category: 'guard', aliases: ['rubber guard', 'guarda de borracha'] },
  { slug: 'open-guard', namePt: 'Guarda aberta', nameEn: 'Open guard', category: 'guard', aliases: ['open guard', 'guarda aberta'] },

  // Passagens
  { slug: 'knee-slice', namePt: 'Passagem de joelho', nameEn: 'Knee slice / knee cut', category: 'guard_pass', aliases: ['knee slice', 'knee cut', 'knee slide', 'passagem de joelho', 'joelho cruzado'] },
  { slug: 'toreando', namePt: 'Toreando', nameEn: 'Toreando pass', category: 'guard_pass', aliases: ['toreando', 'toreando pass', 'bullfighter pass', 'toureando'] },
  { slug: 'leg-drag', namePt: 'Leg drag', nameEn: 'Leg drag', category: 'guard_pass', aliases: ['leg drag', 'arrastar a perna'] },
  { slug: 'over-under-pass', namePt: 'Over-under', nameEn: 'Over-under pass', category: 'guard_pass', aliases: ['over under', 'over under pass', 'passagem por baixo'] },
  { slug: 'stack-pass', namePt: 'Passagem empilhando', nameEn: 'Stack pass', category: 'guard_pass', aliases: ['stack pass', 'double under', 'empilhar', 'empilhando'] },
  { slug: 'long-step', namePt: 'Long step', nameEn: 'Long step pass', category: 'guard_pass', aliases: ['long step'] },
  { slug: 'x-pass', namePt: 'X-pass', nameEn: 'X-pass', category: 'guard_pass', aliases: ['x pass'] },
  { slug: 'body-lock-pass', namePt: 'Body lock', nameEn: 'Body lock pass', category: 'guard_pass', aliases: ['body lock', 'bodylock', 'body lock pass'] },
  { slug: 'smash-pass', namePt: 'Smash pass', nameEn: 'Smash pass', category: 'guard_pass', aliases: ['smash pass', 'pressure pass', 'passagem de pressao'] },

  // Quedas
  { slug: 'single-leg-takedown', namePt: 'Single leg', nameEn: 'Single leg takedown', category: 'takedown', aliases: ['single leg takedown', 'single leg', 'baiana de uma perna'] },
  { slug: 'double-leg-takedown', namePt: 'Baiana (double leg)', nameEn: 'Double leg takedown', category: 'takedown', aliases: ['double leg', 'double leg takedown', 'baiana'] },
  { slug: 'osoto-gari', namePt: 'O-soto-gari', nameEn: 'Osoto gari', category: 'takedown', aliases: ['osoto gari', 'o soto gari', 'osotogari'] },
  { slug: 'ouchi-gari', namePt: 'O-uchi-gari', nameEn: 'Ouchi gari', category: 'takedown', aliases: ['ouchi gari', 'o uchi gari'] },
  { slug: 'seoi-nage', namePt: 'Seoi-nage', nameEn: 'Seoi nage', category: 'takedown', aliases: ['seoi nage', 'seoinage', 'ippon seoi'] },
  { slug: 'uchi-mata', namePt: 'Uchi-mata', nameEn: 'Uchi mata', category: 'takedown', aliases: ['uchi mata', 'uchimata'] },
  { slug: 'sumi-gaeshi', namePt: 'Sumi-gaeshi', nameEn: 'Sumi gaeshi', category: 'takedown', aliases: ['sumi gaeshi', 'sumigaeshi'] },
  { slug: 'ankle-pick', namePt: 'Ankle pick', nameEn: 'Ankle pick', category: 'takedown', aliases: ['ankle pick', 'pegada no tornozelo'] },
  { slug: 'guard-pull', namePt: 'Puxar para a guarda', nameEn: 'Guard pull', category: 'takedown', aliases: ['guard pull', 'pull guard', 'puxar para guarda', 'puxada de guarda'] },
  { slug: 'arm-drag', namePt: 'Arm drag', nameEn: 'Arm drag', category: 'takedown', aliases: ['arm drag', 'armdrag'] },

  // Posições
  { slug: 'mount', namePt: 'Montada', nameEn: 'Mount', category: 'position', aliases: ['montada', 'full mount', 'high mount', 'montada alta', '~mount'] },
  { slug: 'side-control', namePt: '100 quilos', nameEn: 'Side control', category: 'position', aliases: ['side control', 'cem quilos', '100 quilos', 'side mount'] },
  { slug: 'knee-on-belly', namePt: 'Joelho na barriga', nameEn: 'Knee on belly', category: 'position', aliases: ['knee on belly', 'knee on stomach', 'joelho na barriga'] },
  { slug: 'north-south', namePt: 'Norte-sul', nameEn: 'North-south', category: 'position', aliases: ['north south', 'norte sul'] },
  { slug: 'back-control', namePt: 'Controle das costas', nameEn: 'Back control', category: 'position', aliases: ['back control', 'controle das costas', 'seat belt', 'seatbelt', 'body triangle', 'triangulo de corpo'] },
  { slug: 'turtle', namePt: 'Tartaruga', nameEn: 'Turtle', category: 'position', aliases: ['turtle position', 'tartaruga', '~turtle'] },
  { slug: 'crucifix', namePt: 'Crucifixo', nameEn: 'Crucifix', category: 'position', aliases: ['crucifix', 'crucifixo'] },
  { slug: 'kesa-gatame', namePt: 'Kesa-gatame', nameEn: 'Scarf hold', category: 'position', aliases: ['kesa gatame', 'scarf hold'] },

  // Pegada de costas
  { slug: 'back-take', namePt: 'Pegar as costas', nameEn: 'Back take', category: 'back_take', aliases: ['back take', 'take the back', 'pegar as costas', 'pegada das costas', 'pegando as costas'] },
  { slug: 'truck', namePt: 'Truck', nameEn: 'Truck', category: 'back_take', aliases: ['the truck', 'truck position', 'twister'] },

  // Saídas
  { slug: 'shrimp', namePt: 'Fuga de quadril', nameEn: 'Shrimp / hip escape', category: 'escape', aliases: ['fuga de quadril', 'hip escape', 'shrimp', 'shrimping', 'camarao'] },
  { slug: 'bridge-escape', namePt: 'Upa', nameEn: 'Bridge (upa) escape', category: 'escape', aliases: ['upa', 'bridge and roll', 'trap and roll', '~bridge'] },
  { slug: 'elbow-knee-escape', namePt: 'Saída cotovelo-joelho', nameEn: 'Elbow-knee escape', category: 'escape', aliases: ['elbow knee escape', 'elbow escape', 'saida cotovelo joelho'] },
  { slug: 'technical-standup', namePt: 'Levantada técnica', nameEn: 'Technical stand-up', category: 'escape', aliases: ['technical stand up', 'technical standup', 'levantada tecnica', 'levantar tecnicamente'] },
  { slug: 'granby-roll', namePt: 'Granby roll', nameEn: 'Granby roll', category: 'escape', aliases: ['granby roll', 'granby'] },
];
