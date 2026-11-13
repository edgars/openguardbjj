import { formatBytes } from '@bjj/core/format';
import { requireAdmin } from '@/lib/auth';
import { listVideos, storageStats } from '@/lib/data';
import { StorageTable } from '@/components/StorageTable';
import { ReconcileButton } from '@/components/ReconcileButton';

export const dynamic = 'force-dynamic';

const GB = 1024 ** 3;

export default async function StoragePage() {
  const admin = await requireAdmin();
  const [stats, videos] = await Promise.all([storageStats(), listVideos(admin)]);
  const totalBytes = Number(stats.video_bytes) + Number(stats.audio_bytes) + Number(stats.thumb_bytes);
  // Preços variam por plano/região — valores configuráveis por env; confira a página oficial de preços do Vercel Blob.
  const pricePerGbMonth = Number(process.env.BLOB_STORAGE_PRICE_PER_GB_MONTH ?? 0.023);
  const transferPricePerGb = Number(process.env.BLOB_TRANSFER_PRICE_PER_GB ?? 0.05);
  const expectedViewsGbMonth = Number(process.env.EXPECTED_PLAYBACK_GB_MONTH ?? 5);
  const storageCost = (totalBytes / GB) * pricePerGbMonth;
  const transferCost = expectedViewsGbMonth * transferPricePerGb;
  const growthGb = Number(stats.added30dBytes) / GB;

  const cards = [
    { label: 'Vídeos', value: `${stats.videos}`, hint: `${stats.with_file} com MP4 armazenado` },
    { label: 'Espaço ocupado', value: `${(totalBytes / GB).toFixed(2)} GB`, hint: `vídeo ${formatBytes(Number(stats.video_bytes))} · áudio ${formatBytes(Number(stats.audio_bytes))} · thumbs ${formatBytes(Number(stats.thumb_bytes))}` },
    { label: 'Arquivos de áudio', value: `${stats.audio_files}`, hint: formatBytes(Number(stats.audio_bytes)) },
    { label: 'Estimativa mensal', value: `US$ ${(storageCost + transferCost).toFixed(2)}`, hint: `armazenamento US$ ${storageCost.toFixed(2)} + transferência ~US$ ${transferCost.toFixed(2)} (${expectedViewsGbMonth} GB/mês)` },
    { label: 'Crescimento (30 dias)', value: `${growthGb.toFixed(2)} GB`, hint: `≈ US$ ${(growthGb * pricePerGbMonth).toFixed(2)}/mês a mais por mês neste ritmo` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Storage <span className="text-zinc-500">(Vercel Blob)</span></h1>
        <ReconcileButton />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card min-w-0 p-3 sm:p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{c.label}</p>
            <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{c.value}</p>
            <p className="mt-1 break-words text-xs text-zinc-400">{c.hint}</p>
          </div>
        ))}
      </div>
      <p className="break-words text-xs text-zinc-500">
        O Vercel Blob não é ilimitado nem totalmente gratuito: há cota no plano Hobby e cobrança por armazenamento, operações e transferência.
        Ajuste <code>BLOB_STORAGE_PRICE_PER_GB_MONTH</code>, <code>BLOB_TRANSFER_PRICE_PER_GB</code> e <code>EXPECTED_PLAYBACK_GB_MONTH</code> conforme a tabela atual de preços.
      </p>
      <StorageTable
        rows={videos.map((v) => ({
          id: v.id,
          title: v.title,
          status: v.download_status,
          videoBytes: v.blob_pathname ? v.file_size_bytes : null,
          audioBytes: v.audio_pathname ? v.audio_size_bytes : null,
          thumbBytes: v.thumbnail_pathname ? v.thumbnail_size_bytes : null,
          transcription: v.transcription_status,
          resolution: v.resolution,
        }))}
      />
    </div>
  );
}
