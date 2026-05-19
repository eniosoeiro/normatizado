const DISCOURSE_BASE = 'https://normatizando.com.br/forum';

export interface DiscourseThread {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  views: number;
  like_count: number;
  tags: string[];
  category_id: number;
  created_at: string;
  excerpt?: string;
}

export interface DiscourseSiteStats {
  topic_count: number;
  post_count: number;
  user_count: number;
  active_users_30_days: number;
}

export interface DiscourseUser {
  id: number;
  username: string;
  name: string;
  trust_level: number;
  post_count: number;
  like_count: number;
}

export async function getTopThreads(period: 'weekly' | 'monthly' = 'weekly', limit = 10): Promise<DiscourseThread[]> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/top.json?period=${period}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockThreads();
    const data = await res.json();
    return (data.topic_list?.topics ?? []).slice(0, limit);
  } catch {
    return getMockThreads();
  }
}

export async function getSiteStats(): Promise<DiscourseSiteStats> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/about.json`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockStats();
    const data = await res.json();
    return {
      topic_count: data.about?.stats?.topic_count ?? 0,
      post_count: data.about?.stats?.post_count ?? 0,
      user_count: data.about?.stats?.user_count ?? 0,
      active_users_30_days: data.about?.stats?.users_30_days ?? 0,
    };
  } catch {
    return getMockStats();
  }
}

export async function getLatestThreads(limit = 5): Promise<DiscourseThread[]> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/latest.json`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockThreads();
    const data = await res.json();
    return (data.topic_list?.topics ?? [])
      .filter((t: DiscourseThread) => t.id !== 3 && !t.title?.startsWith('About the'))
      .slice(0, limit);
  } catch {
    return getMockThreads();
  }
}

export async function getTopUsers(limit = 5): Promise<DiscourseUser[]> {
  try {
    const res = await fetch(`${DISCOURSE_BASE}/directory_items.json?period=monthly&order=post_count`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return getMockUsers();
    const data = await res.json();
    return (data.directory_items ?? []).slice(0, limit).map((item: any) => ({
      id: item.user.id,
      username: item.user.username,
      name: item.user.name,
      trust_level: item.user.trust_level,
      post_count: item.post_count,
      like_count: item.likes_received,
    }));
  } catch {
    return getMockUsers();
  }
}

function getMockThreads(): DiscourseThread[] {
  return [
    { id: 1, title: 'Interpretação do item 13.5.1.2 para vasos de categoria IV', slug: 'vasos-categoria-iv', posts_count: 8, views: 420, like_count: 42, tags: ['nr-13', 'vasos-pressao'], category_id: 1, created_at: new Date().toISOString(), excerpt: 'Alguém já enfrentou auditorias onde o fiscal exigiu prontuário reconstruído mesmo com a placa de identificação original legível?' },
    { id: 2, title: 'Cálculo de PLr para prensa hidráulica com comando bimanual tipo IIIC', slug: 'plr-prensa-hidraulica', posts_count: 6, views: 280, like_count: 28, tags: ['nr-12', 'iso-13849'], category_id: 4, created_at: new Date().toISOString(), excerpt: 'Dificuldade em validar o MTTFd dos componentes pneumáticos.' },
    { id: 3, title: 'Dimensionamento de malha de terra em subestação de 13,8 kV', slug: 'malha-terra-subestacao', posts_count: 3, views: 190, like_count: 17, tags: ['abnt-nbr-5418', 'aterramento'], category_id: 2, created_at: new Date().toISOString(), excerpt: 'Pela NBR 15751 o cálculo de tensão de passo é direto, mas a resistividade da medida única apresentou três camadas.' },
  ];
}

function getMockStats(): DiscourseSiteStats {
  return { topic_count: 0, post_count: 0, user_count: 0, active_users_30_days: 0 };
}

function getMockUsers(): DiscourseUser[] {
  return [];
}
