// Carteira de produtos Lubrax — classificação derivada da descrição SAP de cada SKU.
// Regras de leitura da descrição (viscosidade, especificações, embalagem) + família/segmento.
// Os textos de família são resumos comerciais para apoio ao consultor: valide com o
// catálogo técnico oficial Lubrax antes de usar em proposta formal.

window.CARTEIRA = (function () {
  const SEGMENTOS = [
    { id: 'leve', nome: 'Automotivo leve', perfil: 'Carros de passeio, flex, SUVs e utilitários leves' },
    { id: 'diesel', nome: 'Diesel / pesados', perfil: 'Caminhões, ônibus, picapes diesel e frotas' },
    { id: 'moto', nome: 'Motos e 2 tempos', perfil: 'Motos 4T, 2T, náutico e pequenos motores' },
    { id: 'agro', nome: 'Agrícola / off-road', perfil: 'Tratores, máquinas agrícolas e fora de estrada' },
    { id: 'transm', nome: 'Transmissão e diferencial', perfil: 'Câmbios manuais, automáticos (ATF) e diferenciais' },
    { id: 'graxa', nome: 'Graxas', perfil: 'Rolamentos, chassis, cubos e pontos de lubrificação' },
    { id: 'manut', nome: 'Fluidos de manutenção', perfil: 'Freio e arrefecimento (radiador)' },
    { id: 'ind', nome: 'Industrial', perfil: 'Hidráulicos, compressores, engrenagens e processos' },
    { id: 'oem', nome: 'Marca de montadora (OEM)', perfil: 'Produtos envasados para montadoras / pós-venda' },
  ];

  // Famílias: ordem importa (primeira regra que casa vence)
  const FAMILIAS = [
    { id: 'oem-nissan', re: /NISSAN/, nome: 'OEM Nissan', seg: 'oem', texto: 'Óleo de motor com marca da montadora para a rede de pós-venda. Indicar para concessionárias e oficinas que atendem a marca.' },
    { id: 'oem-mp', re: /^MP\s?5W40|^MP /, nome: 'OEM (MP 5W40 508.88/509.99)', seg: 'oem', texto: 'Óleo sintético para montadora, especificação VW 508.88/509.99. Foco em concessionárias e oficinas especializadas.' },
    { id: 'supera', re: /SUPERA/, nome: 'Lubrax Supera', seg: 'leve', texto: 'Linha superior para motores modernos de veículos leves. Argumento: proteção e economia de combustível em viscosidades baixas (0W20, 5W20, 5W30).' },
    { id: 'valora', re: /VALORA/, nome: 'Lubrax Valora', seg: 'leve', texto: 'Linha de alto desempenho para veículos leves e SUVs, incluindo versão Offroad. Posicionar acima da linha de entrada.' },
    { id: 'top-auto', re: /TOP AUTO/, nome: 'Lubrax Top Auto', seg: 'leve', texto: 'Linha principal para veículos leves: do mineral (20W50/25W50) ao sintético com normas de montadora (Dexos1, VW 502/505/507/508, ACEA C2/C3, API SQ). Escolha pelo manual do veículo.' },
    { id: 'tecno', re: /TECNO/, nome: 'Lubrax Tecno', seg: 'leve', texto: 'Linha mineral de entrada para veículos leves com mais quilometragem. Boa porta de entrada para depois subir o cliente para Top Auto semissintético.' },
    { id: 'essencial-auto', re: /ESSENCIAL SL|ESSENCIAL\s+20W/, nome: 'Lubrax Essencial (auto)', seg: 'leve', texto: 'Linha econômica para veículos leves. Use para competir em preço e defender volume.' },
    { id: 'top-turbo', re: /TOP TURBO/, nome: 'Lubrax Top Turbo', seg: 'diesel', texto: 'Linha diesel para pesados e frotas: do Essencial CI-4 ao CK-4 e sintético 10W40, com aprovações MB 228.3/228.31. Argumento: intervalo de troca e proteção em frota.' },
    { id: 'turbo-me', re: /TURBO ME/, nome: 'Lubrax Turbo ME (monoviscoso)', seg: 'diesel', texto: 'Óleos monoviscosos (SAE 30/40/50) para motores diesel antigos, estacionários e aplicações específicas.' },
    { id: 'unitractor', re: /UNITRACTOR/, nome: 'Lubrax Unitractor', seg: 'agro', texto: 'Óleo multifuncional para tratores (motor, transmissão e hidráulico conforme fabricante). Foco em revendas agro e fazendas.' },
    { id: 'top-moto', re: /TOP MOTO|MOTO 4T/, nome: 'Lubrax Top Moto', seg: 'moto', texto: 'Óleos 4T para motos com norma JASO MA/MA2 (embreagem banhada). Alto giro em postos e lojas de moto; 10W30 MA2 semissintético é o upgrade natural do 20W50.' },
    { id: 'nautico', re: /NAUTICO/, nome: 'Lubrax Náutico 2T', seg: 'moto', texto: 'Óleo 2T TC-W3 para motores de popa. Oportunidade em cidades litorâneas e marinas.' },
    { id: '2t', re: /\b2T\b/, nome: 'Lubrax 2T', seg: 'moto', texto: 'Óleos para motores 2 tempos (motosserras, roçadeiras, ciclomotores). Item de complemento de mix.' },
    { id: 'atf', re: /ATF/, nome: 'Lubrax ATF', seg: 'transm', texto: 'Fluidos para transmissão automática e direção hidráulica (TA, DX3, DX6, TDX). Confirmar especificação do câmbio.' },
    { id: 'trm', re: /TRM|GL[ -]?[45]\b|\bGL 5|\bGL 4/, nome: 'Lubrax TRM / GL', seg: 'transm', texto: 'Óleos para engrenagens automotivas: câmbio manual (GL-4) e diferencial (GL-5, inclusive LS para autoblocante).' },
    { id: 'graxa', re: /AUTOLITH|CALCIUM|CHASSIS/, nome: 'Lubrax Graxas', seg: 'graxa', texto: 'Graxas de lítio (Autolith 2), cálcio e chassis. Item de recorrência em oficinas, frotas e agro.' },
    { id: 'freio', re: /FREIO/, nome: 'Lubrax Fluido de Freio', seg: 'manut', texto: 'Fluido de freio (DOT 4). Complemento de ticket na troca de óleo e revisão.' },
    { id: 'radiador', re: /RADIADOR/, nome: 'Lubrax Fluido para Radiadores', seg: 'manut', texto: 'Fluido de arrefecimento pronto/concentrado. Venda casada na revisão.' },
    { id: 'hydra', re: /HYDRA/, nome: 'Lubrax Hydra', seg: 'ind', texto: 'Óleos hidráulicos (ISO VG 32/68/100, versões HLP/XP). Máquinas, implementos, indústria e agro.' },
    { id: 'compsor', re: /COMPSOR/, nome: 'Lubrax Compsor', seg: 'ind', texto: 'Óleos para compressores de ar e refrigeração.' },
    { id: 'gear', re: /GEAR|UTILE|GRANS TAC/, nome: 'Lubrax Industrial (engrenagens / processos)', seg: 'ind', texto: 'Óleos industriais para engrenagens fechadas e aplicações específicas. Venda técnica — envolver suporte técnico.' },
    { id: 'betumen', re: /BETUMEN/, nome: 'Lubrax Betumen', seg: 'ind', texto: 'Produto especial para aplicações de proteção/vedação. Venda sob demanda.' },
  ];
  const FAMILIA_OUTROS = { id: 'outros', nome: 'Outros', seg: 'ind', texto: 'SKU sem família identificada pela descrição — revisar.' };

  function familia(desc) {
    const d = desc.toUpperCase();
    return FAMILIAS.find(f => f.re.test(d)) || FAMILIA_OUTROS;
  }

  function viscosidade(desc) {
    const d = desc.toUpperCase().replace(/(\d{1,2})W-(\d{2,3})/g, '$1W$2');
    let m = d.match(/(?:^|[^\d])(\d{1,2}W\d{2,3})\b/);
    if (m) return m[1];
    m = d.match(/\b(\d{2})W\b/);
    if (m) return m[1] + 'W';
    m = d.match(/TURBO ME (\d{2})/) || d.match(/GL ?5 (?:LS )?(\d{2,3})\b/) || d.match(/TRM ?[45] (\d{2,3})\b/) || d.match(/GL ?-?[45] (\d{2,3})\b/);
    if (m) return 'SAE ' + m[1];
    m = d.match(/(?:HYDRA|COMPSOR|GEAR|UTILE \w+|AC|RF)\s(?:XP |V\d H |V\d HLP |)?(\d{2,3})\b/);
    if (m) return 'ISO VG ' + m[1];
    return '';
  }

  function especificacoes(desc) {
    const d = desc.toUpperCase();
    const s = [];
    const add = (re, label) => { if (re.test(d)) s.push(label); };
    add(/\bSQ\b|APISQ|SQ DX1|SQ HIBRID|\bSQ-/, 'API SQ');
    add(/\bSP\b/, 'API SP');
    add(/\bSN\b/, 'API SN');
    add(/\bSL\b|SL-|SL SEMI/, 'API SL');
    add(/DX1/, 'dexos1');
    add(/C2,? ?C3|C2 C3/, 'ACEA C2/C3');
    add(/0W30 C2 PSA/, 'ACEA C2 (PSA)');
    add(/502\/505/, 'VW 502/505');
    add(/507/, 'VW 507');
    add(/508\.88/, 'VW 508.88');
    add(/509\.99/, 'VW 509.99');
    add(/CK-?4/, 'API CK-4');
    add(/CI-?4/, 'API CI-4');
    add(/CH-?4/, 'API CH-4');
    add(/228\.31/, 'MB 228.31');
    add(/228\.3(?!1)/, 'MB 228.3');
    add(/MA2/, 'JASO MA2');
    add(/\bMA\b(?!2)/, 'JASO MA');
    add(/TC-W3/, 'NMMA TC-W3');
    add(/GL[ -]?5|TRM 5/, 'API GL-5');
    add(/GL[ -]?4|TRM 4/, 'API GL-4');
    add(/\bLS\b/, 'Limited Slip');
    add(/DOT ?4/, 'DOT 4');
    add(/HLP/, 'HLP');
    add(/HIBRID/, 'Híbridos');
    add(/AUTOLITH 2|CHASSIS 2/, 'NLGI 2');
    return s;
  }

  function base(desc, fam) {
    const d = desc.toUpperCase().replace(/(\d{1,2})W-(\d{2,3})/g, '$1W$2');
    if (/SINT|SYNT/.test(d)) return 'Sintético';
    if (/SEMI/.test(d)) return 'Semissintético';
    if (/\bMIN|MINERAL/.test(d)) return 'Mineral';
    if (fam.seg === 'graxa') return 'Graxa';
    // Óleos de motor de alta especificação sem a palavra SINT na descrição
    if (/(?:^|[^\d])(0W20|0W30|5W20|5W30|5W40)\b|HIBRID|508\.88|507/.test(d) && ['leve', 'oem'].includes(fam.seg)) return 'Sintético';
    if (['leve', 'diesel', 'agro'].includes(fam.seg) && /\d{1,2}W\d{2}|ME \d{2}/.test(d)) return 'Mineral';
    if (fam.id === 'top-moto' && /\d{1,2}W\d{2}/.test(d)) return 'Mineral';
    if (['leve', 'diesel', 'agro', 'oem'].includes(fam.seg)) return 'Não informado';
    return 'Especialidade';
  }

  function embalagem(desc) {
    const d = desc.toUpperCase().replace(/\s+/g, ' ');
    let m = d.match(/(\d+)\s?X\s?(1\/2|1\/5|\d+)\s?L\b/) || d.match(/(\d+)X(1\/2|1\/5|\d+)(?:L)?$/);
    if (m) return frasco(m[1], m[2], 'L');
    m = d.match(/CXC?(\d+)[FLU](1\/2|1\/5|\d+)([LK])/);
    if (m) return frasco(m[1], m[2], m[3] === 'K' ? 'kg' : 'L');
    m = d.match(/\b(BB|BL|TB)\s?(\d+)\s?(L|K|KG)\b/);
    if (m) return { label: ({ BB: 'Balde', BL: 'Balde', TB: 'Tambor' })[m[1]] + ' ' + m[2] + (m[3] === 'L' ? ' L' : ' kg'), fmt: m[1] === 'TB' ? 'Granel' : 'Balde' };
    if (/-20L$|- ?20L/.test(d)) return { label: 'Balde 20 L', fmt: 'Balde' };
    if (/-1L$/.test(d)) return { label: 'Frasco 1 L', fmt: 'Frasco' };
    return { label: '—', fmt: '—' };
  }
  function frasco(n, v, u) {
    const vol = v === '1/2' ? '500 ml' : v === '1/5' ? '200 ml' : v + (u === 'kg' ? ' kg' : ' L');
    return { label: n + ' × ' + vol, fmt: (v === '1/2' || v === '1/5') ? 'Frasco pequeno' : (+v >= 3 ? 'Galão' : 'Frasco') };
  }

  // Premium sugerido: sintético, semissintético, linhas superiores ou normas de montadora
  function premiumSugerido(desc, fam, b) {
    if (b === 'Sintético' || b === 'Semissintético') return true;
    if (['supera', 'valora', 'oem-mp', 'oem-nissan'].includes(fam.id)) return true;
    if (/PREMIUM/.test(desc.toUpperCase()) && ['leve', 'agro', 'diesel'].includes(fam.seg)) return true;
    if (['leve', 'diesel', 'moto', 'agro', 'oem'].includes(fam.seg)) return false;
    return null; // especialidades: fora do indicador
  }

  function classificar(codigo, desc) {
    const fam = familia(desc);
    const b = base(desc, fam);
    return {
      codigo, desc, familia: fam.id, familiaNome: fam.nome, segmento: fam.seg,
      base: b, viscosidade: viscosidade(desc), specs: especificacoes(desc),
      embalagem: embalagem(desc), premium: premiumSugerido(desc, fam, b),
    };
  }

  // Perfil do cliente (Q1 do roteiro) -> segmentos para recomendação
  const PERFIL_SEGMENTOS = {
    'Leves (passeio/flex)': ['leve', 'manut'],
    'Leves modernos (turbo/injeção direta)': ['leve'],
    'Motos': ['moto'],
    'Diesel / caminhões / ônibus': ['diesel', 'transm', 'graxa'],
    'Agrícola / máquinas': ['agro', 'ind', 'graxa', 'transm'],
    'Industrial / hidráulico': ['ind', 'graxa'],
    'Náutico / 2T': ['moto'],
    'Concessionária (OEM)': ['oem', 'leve'],
  };

  return { SEGMENTOS, FAMILIAS: FAMILIAS.concat([FAMILIA_OUTROS]), classificar, PERFIL_SEGMENTOS };
})();
