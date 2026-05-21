import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tintSvg(svg: string, color: string | null | undefined): string {
  if (!color) {
    return svg;
  }
  const escapedColor = escapeRegExp(color);
  return svg
    .replace(/fill="(?!none)[^"]+"/gi, `fill="${color}"`)
    .replace(/stroke="(?!none)[^"]+"/gi, `stroke="${color}"`)
    .replace(/fill:\s*(?!none)[^;"']+/gi, `fill:${color}`)
    .replace(/stroke:\s*(?!none)[^;"']+/gi, `stroke:${color}`)
    .replace(/currentColor/g, color)
    .replace(new RegExp(escapedColor, 'g'), color);
}

export function useCachedSvg(
  url: string,
  filename: string,
  color?: string | null,
) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const dir = new Directory(Paths.cache, 'logos');
        dir.create({ idempotent: true, intermediates: true });
        const file = new File(dir, filename);

        if (file.exists) {
          const content = await file.text();
          if (!cancelled) {
            setSvgContent(tintSvg(content, color));
            setLoading(false);
          }
          return;
        }

        await File.downloadFileAsync(url, file, {
          idempotent: true,
          signal: controller.signal,
        });
        const content = await file.text();
        if (!cancelled) {
          setSvgContent(tintSvg(content, color));
        }
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[useCachedSvg] Failed to load SVG:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [color, filename, url]);

  return { svgContent, loading };
}
