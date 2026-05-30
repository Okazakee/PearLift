function extractMarkerValue(text, marker) {
  const match = text.match(new RegExp(`${marker}=([0-9a-f]{64})`, 'i'));
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractPairingSecret(text) {
  return extractMarkerValue(text, 'SYNC_PAIRING_SECRET');
}

export function extractBootstrapKey(text) {
  return extractMarkerValue(text, 'SYNC_BOOTSTRAP_KEY');
}

export function encodeSyncInvite(pairingSecretHex, bootstrapKeyHex) {
  const payload = JSON.stringify({
    pairingSecretHex,
    bootstrapKeyHex,
  });

  return `pearlift-sync-room:v1:${Buffer.from(payload, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')}`;
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('SYNC_DIAGNOSTICS_')) {
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) return null;
    try {
      return JSON.parse(trimmed.slice(equalsIndex + 1));
    } catch {
      return null;
    }
  }

  if (!trimmed.includes('"type":"SYNC_DIAGNOSTICS"')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const embedded = extractEmbeddedDiagnosticsJson(trimmed);
    if (!embedded) {
      return null;
    }

    try {
      return JSON.parse(embedded);
    } catch {
      return null;
    }
  }
}

function extractEmbeddedDiagnosticsJson(line) {
  const start = line.indexOf('{"type":"SYNC_DIAGNOSTICS"');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < line.length; index += 1) {
    const char = line[index];
    if (!char) {
      continue;
    }

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char !== '}') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return line.slice(start, index + 1);
    }
  }

  return null;
}

export function extractDiagnostics(text) {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index] ?? '');
    if (parsed?.type === 'SYNC_DIAGNOSTICS') {
      return parsed;
    }
  }
  return null;
}
