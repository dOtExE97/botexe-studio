// GiftListEditor — wählt mehrere Gifts visuell (für Bingo-Felder). Speichert als
// kommagetrennten Slug-String (kompatibel zu props.gifts). Chips zeigen das echte
// Gift-Bild; hinzugefügt wird über den <GiftPicker> aus dem Katalog (642+).
import { useMemo } from 'react';
import { X } from 'lucide-react';
import GiftPicker from './GiftPicker';
import { useGiftCatalog } from '../hooks/useGiftCatalog';

export default function GiftListEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { gifts } = useGiftCatalog();
  const slugs = useMemo(
    () => String(value || '').split(',').map((s) => s.trim()).filter(Boolean),
    [value],
  );
  const iconFor = (slug: string) =>
    gifts.find((g) => g.slug.toLowerCase() === slug.toLowerCase())?.icon;

  const add = (slug: string) => {
    if (!slug || slugs.some((s) => s.toLowerCase() === slug.toLowerCase())) return;
    onChange([...slugs, slug].join(','));
  };
  const remove = (slug: string) => onChange(slugs.filter((s) => s !== slug).join(','));

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {slugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {slugs.map((slug) => (
            <span key={slug} className="flex items-center gap-1 rounded-full border border-studio-border bg-studio-raised py-0.5 pl-1 pr-1.5 text-[11px]">
              {iconFor(slug) ? (
                <img src={iconFor(slug)} alt="" className="h-4 w-4 object-contain" />
              ) : (
                <span className="grid h-4 w-4 place-items-center text-[8px] text-studio-muted">?</span>
              )}
              <span className="normal-case tracking-normal">{slug}</span>
              <button onClick={() => remove(slug)} className="text-studio-muted hover:text-studio-accent"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <GiftPicker value="" onChange={add} placeholder="+ Gift-Feld hinzufügen…" />
    </div>
  );
}
