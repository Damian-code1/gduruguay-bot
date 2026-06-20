const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} = require('@discordjs/voice');
const prism = require('prism-media');
const OpusScript = require('opusscript');

const MAX_BUFFER_MS = 120 * 1000; // keep last 120 seconds
const SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 2;
const MONO_BYTES_PER_MS = Math.round((SAMPLE_RATE / 1000) * BYTES_PER_SAMPLE);
const OPUS_FRAME_SIZE = 960;
const PACKET_DURATION_MS = 20;
const PCM_BYTES_PER_FRAME = OPUS_FRAME_SIZE * 2 * 2;
const guildStates = new Map();

function getOrCreateState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      targetChannelId: null,
      allowReconnect: false,
      connection: null,
      receiverBound: false,
      userBuffers: new Map(),
      activeStreams: new Map(),
    });
  }
  return guildStates.get(guildId);
}

function trimUserBuffer(chunks, now = Date.now()) {
  const cutoff = now - MAX_BUFFER_MS;
  // find first index with timestamp >= cutoff using linear scan (arrays expected small)
  let idx = 0;
  while (idx < chunks.length && chunks[idx].timestamp < cutoff) idx += 1;
  if (idx > 0) chunks.splice(0, idx);
}

function bindReceiver(guildId, connection) {
  const state = getOrCreateState(guildId);
  if (state.receiverBound) return;

  const cleanupStream = (userId) => {
    const entry = state.activeStreams.get(userId);
    if (!entry) return;

    try { entry.opusStream?.destroy?.(); } catch (e) {}
    try { entry.decoder?.destroy?.(); } catch (e) {}
    state.activeStreams.delete(userId);
  };

  connection.receiver.speaking.on('start', userId => {
    if (state.activeStreams.has(userId)) return;

    const opusStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000,
      },
    });

    const decoder = new prism.opus.Decoder({
      rate: SAMPLE_RATE,
      channels: 2,
      frameSize: OPUS_FRAME_SIZE,
    });

    state.activeStreams.set(userId, { opusStream, decoder });

    opusStream.pipe(decoder);

    decoder.on('data', pcmChunk => {
      const now = Date.now();
      const current = state.userBuffers.get(userId) || [];
      current.push({ timestamp: now, pcm: Buffer.from(pcmChunk) });
      trimUserBuffer(current, now);
      state.userBuffers.set(userId, current);
    });

    const cleanup = () => {
      cleanupStream(userId);
    };

    opusStream.on('end', cleanup);
    opusStream.on('close', cleanup);
    opusStream.on('error', cleanup);
    decoder.on('end', cleanup);
    decoder.on('close', cleanup);
    decoder.on('error', cleanup);
  });

  state.receiverBound = true;
}

function attachConnectionRecovery(guild, connection) {
  const guildId = guild.id;
  const state = getOrCreateState(guildId);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (!state.allowReconnect) return;

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      const target = guild.channels.cache.get(state.targetChannelId);
      if (!target || !target.isVoiceBased()) {
        connection.destroy();
        state.connection = null;
        state.allowReconnect = false;
        return;
      }

      const newConnection = joinVoiceChannel({
        channelId: target.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      state.connection = newConnection;
      state.receiverBound = false;
      bindReceiver(guildId, newConnection);
      attachConnectionRecovery(guild, newConnection);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    state.connection = null;
    state.receiverBound = false;
  });
}

async function joinAndStay(channel) {
  const guild = channel.guild;
  const state = getOrCreateState(guild.id);

  state.targetChannelId = channel.id;
  state.allowReconnect = true;

  const existing = getVoiceConnection(guild.id);
  if (existing) {
    try {
      existing.rejoin({ channelId: channel.id, selfDeaf: false, selfMute: false });
      await entersState(existing, VoiceConnectionStatus.Ready, 10_000);
      state.connection = existing;
      state.receiverBound = false;
      bindReceiver(guild.id, existing);
      return existing;
    } catch {
      existing.destroy();
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

  state.connection = connection;
  state.receiverBound = false;
  bindReceiver(guild.id, connection);
  attachConnectionRecovery(guild, connection);

  return connection;
}

function getRecentUserPackets(guildId, durationMs = 30_000) {
  const state = guildStates.get(guildId);
  if (!state) return new Map();

  const cutoff = Date.now() - durationMs;
  const result = new Map();

  for (const [userId, chunks] of state.userBuffers.entries()) {
    const recentEntries = chunks.filter(entry => entry.timestamp >= cutoff);
    if (recentEntries.length) {
      result.set(userId, recentEntries);
    }
  }

  return result;
}

function createWavHeader(dataLength, sampleRate = 48_000, channels = 2, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function createSilencePcm(durationMs) {
  const bytes = Math.max(0, Math.round(durationMs * MONO_BYTES_PER_MS));
  return Buffer.alloc(bytes);
}

function asBuffer(decoded) {
  if (Buffer.isBuffer(decoded)) return decoded;
  if (decoded instanceof Int16Array) {
    return Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  }
  return Buffer.from(decoded);
}

function downmixStereoPcmToMono(stereoPcm) {
  if (!stereoPcm?.length) return Buffer.alloc(0);

  const sampleCount = Math.floor(stereoPcm.length / 4); // 2 canales * 16 bits
  if (!sampleCount) return Buffer.alloc(0);

  const mono = Buffer.alloc(sampleCount * 2);

  for (let i = 0, out = 0; i + 3 < stereoPcm.length; i += 4, out += 2) {
    const left = stereoPcm.readInt16LE(i);
    const right = stereoPcm.readInt16LE(i + 2);
    const mixed = Math.max(-32768, Math.min(32767, Math.round((left + right) / 2)));
    mono.writeInt16LE(mixed, out);
  }

  return mono;
}

function decodeOpusEntriesToPcm(entries, cutoff, durationMs) {
  if (Array.isArray(entries) && entries.length && entries.some(entry => entry?.pcm)) {
    const sortedPcm = entries
      .filter(entry => entry && typeof entry.timestamp === 'number' && entry.pcm)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const frameCount = Math.ceil(Math.max(0, Number(durationMs || 0)) / PACKET_DURATION_MS);
    if (!frameCount) return Buffer.alloc(0);

    const frames = new Array(frameCount).fill(null);
    for (const entry of sortedPcm) {
      const idx = Math.floor((entry.timestamp - cutoff) / PACKET_DURATION_MS);
      if (idx < 0 || idx >= frameCount) continue;
      frames[idx] = Buffer.from(entry.pcm);
    }

    const pcmChunks = [];
    for (let i = 0; i < frameCount; i += 1) {
      const pcm = frames[i];
      if (!pcm || !pcm.length) {
        pcmChunks.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
        continue;
      }

      if (pcm.length === PCM_BYTES_PER_FRAME) {
        pcmChunks.push(pcm);
      } else if (pcm.length > PCM_BYTES_PER_FRAME) {
        pcmChunks.push(pcm.subarray(0, PCM_BYTES_PER_FRAME));
      } else {
        pcmChunks.push(Buffer.concat([pcm, Buffer.alloc(PCM_BYTES_PER_FRAME - pcm.length)]));
      }
    }

    return downmixStereoPcmToMono(Buffer.concat(pcmChunks));
  }

  // Build a frame-aligned buffer covering [cutoff, cutoff+durationMs)
  const start = Number(cutoff || 0);
  const dur = Math.max(0, Number(durationMs || 0));
  const frameCount = Math.ceil(dur / PACKET_DURATION_MS);
  if (frameCount <= 0) return Buffer.alloc(0);

  // map frames by index
  const frames = new Array(frameCount).fill(null);

  // sort entries by timestamp
  const sorted = Array.isArray(entries) ? entries.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) : [];

  for (const entry of sorted) {
    if (!entry || !entry.chunk || typeof entry.timestamp !== 'number') continue;
    const idx = Math.floor((entry.timestamp - start) / PACKET_DURATION_MS);
    if (idx < 0 || idx >= frameCount) continue;
    // keep the last packet seen for this frame index
    frames[idx] = entry.chunk;
  }

  const decoder = new OpusScript(SAMPLE_RATE, 2, OpusScript.Application.AUDIO);
  const pcmChunks = [];

  for (let i = 0; i < frameCount; i += 1) {
    const chunk = frames[i];
    if (!chunk) {
      // insert one blank opus-frame worth of PCM
      pcmChunks.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
      continue;
    }

    try {
      const decoded = decoder.decode(chunk, OPUS_FRAME_SIZE);
      const pcm = asBuffer(decoded);
      if (pcm && pcm.length === PCM_BYTES_PER_FRAME) {
        pcmChunks.push(pcm);
      } else if (pcm && pcm.length > 0) {
        // if decoder returned more/less bytes, normalize by truncating or padding
        if (pcm.length > PCM_BYTES_PER_FRAME) pcmChunks.push(pcm.subarray(0, PCM_BYTES_PER_FRAME));
        else pcmChunks.push(Buffer.concat([pcm, Buffer.alloc(PCM_BYTES_PER_FRAME - pcm.length)]));
      } else {
        pcmChunks.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
      }
    } catch (err) {
      // decoding failed for this frame — insert silence instead of throwing
      try {
        console.warn('[voiceManager] Opus decode failed for a frame, inserting silence', err && err.message);
      } catch (e) {}
      pcmChunks.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
    }
  }

  if (typeof decoder.delete === 'function') {
    decoder.delete();
  }

  return downmixStereoPcmToMono(Buffer.concat(pcmChunks));
}

function mixMonoTracks(tracks, targetLength) {
  if (!tracks.length || !targetLength) {
    return Buffer.alloc(0);
  }

  const mixed = Buffer.alloc(targetLength);

  for (let offset = 0; offset + 1 < targetLength; offset += 2) {
    let sum = 0;
    let contributors = 0;

    for (const track of tracks) {
      if (!track?.length || offset + 1 >= track.length) continue;
      sum += track.readInt16LE(offset);
      contributors += 1;
    }

    if (!contributors) continue;

    const averaged = Math.max(-32768, Math.min(32767, Math.round(sum / contributors)));
    mixed.writeInt16LE(averaged, offset);
  }

  return mixed;
}

function padMonoTrack(track, targetLength) {
  if (!track?.length) return Buffer.alloc(targetLength);
  if (track.length === targetLength) return track;
  if (track.length > targetLength) return track.subarray(0, targetLength);
  return Buffer.concat([track, Buffer.alloc(targetLength - track.length)]);
}

async function buildWavByAllUsers(guildId, durationMs = 30_000) {
  const packetsByUser = getRecentUserPackets(guildId, durationMs);
  const cutoff = Date.now() - durationMs;
  const targetPcmLength = Math.max(2, Math.round(durationMs * MONO_BYTES_PER_MS));
  const tracks = [];
  const users = [];

  for (const [userId, entries] of packetsByUser.entries()) {
    try {
      const pcmData = decodeOpusEntriesToPcm(entries, cutoff, durationMs);
      if (!pcmData || !pcmData.length) continue;

      const track = padMonoTrack(pcmData, targetPcmLength);
      tracks.push(track);
      users.push(userId);
    } catch {
      // Si falla un usuario, seguir con los demás
    }
  }

  if (!tracks.length) {
    return { wav: null, users: [], silent: true };
  }

  const mixedPcm = mixMonoTracks(tracks, targetPcmLength);
  if (!mixedPcm?.length) {
    return { wav: null, users, silent: true };
  }

  const wav = Buffer.concat([createWavHeader(mixedPcm.length, SAMPLE_RATE, 1, 16), mixedPcm]);

  return { wav, users };
}

async function buildWavByUser(guildId, durationMs = 30_000) {
  const packetsByUser = getRecentUserPackets(guildId, durationMs);
  const output = [];

  for (const [userId, entries] of packetsByUser.entries()) {
    try {
      const cutoff = Date.now() - durationMs;
      const pcmData = decodeOpusEntriesToPcm(entries, cutoff, durationMs);
      if (!pcmData || !pcmData.length) continue;

      const wav = Buffer.concat([createWavHeader(pcmData.length, 48_000, 1, 16), pcmData]);
      output.push({ userId, wav });
    } catch {
      // Si falla el decode de un usuario, continuar con los demás
    }
  }

  return output;
}

function leaveAndCleanup(guildId) {
  const state = guildStates.get(guildId);
  const connection = getVoiceConnection(guildId) || state?.connection;

  if (state) {
    state.allowReconnect = false;
    state.targetChannelId = null;
  }

  if (connection) {
    connection.destroy();
  }

  if (state) {
    state.connection = null;
    state.receiverBound = false;
    for (const [userId, entry] of state.activeStreams.entries()) {
      try { entry.opusStream?.destroy?.(); } catch (e) {}
      try { entry.decoder?.destroy?.(); } catch (e) {}
    }
    state.activeStreams.clear();
    state.userBuffers.clear();
  }
}

function cleanupAllVoiceConnections() {
  for (const guildId of guildStates.keys()) {
    leaveAndCleanup(guildId);
  }
}

module.exports = {
  joinAndStay,
  getVoiceConnection,
  buildWavByAllUsers,
  buildWavByUser,
  leaveAndCleanup,
  cleanupAllVoiceConnections,
};
