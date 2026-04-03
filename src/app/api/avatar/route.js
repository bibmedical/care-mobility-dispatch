import { NextResponse } from 'next/server';
import { DEFAULT_ASSISTANT_AVATAR } from '@/helpers/nemt-dispatch-state';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

const buildAvatarPayload = aiState => ({
  ok: true,
  avatar: {
    name: String(aiState?.avatarName || DEFAULT_ASSISTANT_AVATAR.name),
    image: String(aiState?.avatarImage || DEFAULT_ASSISTANT_AVATAR.image),
    updatedAt: String(aiState?.avatarUpdatedAt || ''),
    memoryNotes: String(aiState?.memoryNotes || ''),
    visible: aiState?.assistantVisible !== false,
    memorySections: {
      patients: String(aiState?.memorySections?.patients || ''),
      drivers: String(aiState?.memorySections?.drivers || ''),
      rules: String(aiState?.memorySections?.rules || ''),
      phones: String(aiState?.memorySections?.phones || '')
    }
  }
});

export async function GET() {
  const state = await readIntegrationsState();
  return NextResponse.json(buildAvatarPayload(state?.ai));
}

export async function PUT(request) {
  try {
    const currentState = await readIntegrationsState();
    const body = await request.json();
    const avatarName = String(body?.name || DEFAULT_ASSISTANT_AVATAR.name).trim() || DEFAULT_ASSISTANT_AVATAR.name;
    const avatarImage = String(body?.image || DEFAULT_ASSISTANT_AVATAR.image).trim() || DEFAULT_ASSISTANT_AVATAR.image;
    const memoryNotes = String(body?.memoryNotes || '').trim();
    const assistantVisible = body?.visible !== false;
    const memorySections = {
      patients: String(body?.memorySections?.patients || ''),
      drivers: String(body?.memorySections?.drivers || ''),
      rules: String(body?.memorySections?.rules || ''),
      phones: String(body?.memorySections?.phones || '')
    };
    const savedState = await writeIntegrationsState({
      ...currentState,
      ai: {
        ...currentState.ai,
        assistantVisible,
        avatarName,
        avatarImage,
        memoryNotes,
        memorySections,
        avatarUpdatedAt: new Date().toISOString()
      }
    });

    return NextResponse.json(buildAvatarPayload(savedState?.ai));
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save avatar settings'
    }, {
      status: 400
    });
  }
}