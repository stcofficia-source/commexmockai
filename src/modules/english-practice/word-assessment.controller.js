const { AppError } = require('../../core/errors');
const logger = require('../../core/logger');
const sttService = require('../stt/stt.service');
const {
  assertAiCreditAccess,
  settleAiUsage,
} = require('../../core/credit-billing.service');

const MAX_WORD_LENGTH = 80;

function normalizeWord(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(first, second) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= second.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (first[row - 1] === second[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

function assessTranscript(expectedWord, transcript) {
  const expected = normalizeWord(expectedWord);
  const heard = normalizeWord(transcript);
  const distance = editDistance(expected, heard);
  return {
    expected: expectedWord,
    heard: String(transcript || '').trim(),
    matched: Boolean(heard) && distance === 0,
    score: heard ? Math.max(0, Math.round(100 * (1 - distance / Math.max(expected.length, heard.length)))) : 0,
  };
}

async function assessWord(req, res, next) {
  try {
    const expectedWord = String(req.body?.expectedWord || '').trim();
    const accent = String(req.body?.accent || 'british').toLowerCase();
    const authorization = req.headers.authorization || '';
    if (!req.file?.buffer?.length) {
      throw new AppError('Record a word before checking pronunciation.', 400, 'AUDIO_REQUIRED');
    }
    if (!expectedWord || expectedWord.length > MAX_WORD_LENGTH || !/^[a-zA-Z][a-zA-Z' -]*$/.test(expectedWord)) {
      throw new AppError('A valid practice word is required.', 422, 'INVALID_EXPECTED_WORD');
    }
    if (!['british', 'american'].includes(accent)) {
      throw new AppError('Choose either British or American pronunciation.', 422, 'INVALID_ACCENT');
    }

    await assertAiCreditAccess(authorization, 'word_pronunciation');
    const transcription = await sttService.transcribeAudioDetailed(
      req.file.buffer,
      req.file.mimetype || 'audio/webm',
      {
        languageCode: accent === 'american' ? 'en_us' : 'en_uk',
      },
    );
    const assessment = assessTranscript(expectedWord, transcription.text);

    await settleAiUsage({
      authorization,
      serviceKey: 'word_pronunciation',
      reference: `word:${req.user?.id || 'learner'}:${transcription.requestId}`,
      usage: {
        requestId: transcription.requestId,
        provider: 'assemblyai',
        model: transcription.model,
        durationSeconds: transcription.audioDurationSeconds,
      },
    });

    logger.info({ userId: req.user?.id, accent, model: transcription.model, matched: assessment.matched }, 'Word pronunciation checked');
    return res.json({ success: true, data: assessment });
  } catch (error) {
    return next(error);
  }
}

module.exports = { assessWord };
