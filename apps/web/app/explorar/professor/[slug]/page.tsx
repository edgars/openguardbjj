import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { instructorBySlug } from '@/lib/instructors';
import { searchPublic } from '@/lib/public';
import { InstructorCard } from '@/components/InstructorCard';
import { PublicVideoGrid } from '@/components/PublicVideoGrid';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await instructorBySlug((await params).slug);
  return p ? { title: `${p.name} — técnicas de Jiu-Jitsu · itaimjj`, description: p.summary ?? `Vídeos de técnica com ${p.name}.` } : {};
}

export default async function InstructorPage({ params }: Params) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  const p = await instructorBySlug(slug);
  if (!p) notFound();
  const videos = await searchPublic({ instructor: slug });
  if (!videos.length) notFound(); // só professores confirmados em vídeos públicos têm página
  return (
    <div className="space-y-5">
      <Link href="/explorar" className="text-xs text-zinc-400 hover:text-zinc-200">← Explorar</Link>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div><InstructorCard p={p} linkToPage={false} /></div>
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">{videos.length} {videos.length === 1 ? 'vídeo' : 'vídeos'} com {p.name}</h1>
          <PublicVideoGrid videos={videos} />
        </div>
      </div>
    </div>
  );
}
