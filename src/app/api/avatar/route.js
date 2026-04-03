import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { DEFAULT_ASSISTANT_AVATAR } from '@/helpers/nemt-dispatch-state';
import { isAdminRole } from '@/helpers/system-users';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';
import { readUserPreferences, writeUserPreferences } from '@/server/user-preferences-store';

const buildAvatarPayload = (aiState, personalAvatar = null) => ({
  ok: true,
  avatar: {
    name: String(personalAvatar?.name || aiState?.avatarName || DEFAULT_ASSISTANT_AVATAR.name),
    image: String(personalAvatar?.image || aiState?.avatarImage || DEFAULT_ASSISTANT_AVATAR.image),
    updatedAt: String(personalAvatar?.updatedAt || aiState?.avatarUpdatedAt || ''),
    memoryNotes: String(aiState?.memoryNotes || ''),
    visible: aiState?.assistantVisible !== false,
    memorySections: {
      patients: String(aiState?.memorySections?.patients || ''),
      drivers: String(aiState?.memorySections?.drivers || ''),
      rules: String(aiState?.memorySections?.rules || ''),
      phones: String(aiState?.memorySections?.phones || '')
    },
    scope: personalAvatar ? 'admin-personal' : 'global'
  }
});

export async function GET() {
  const state = await readIntegrationsState();
  const session = await getServerSession(options);

  if (session?.user?.id && isAdminRole(session?.user?.role)) {
    const preferences = await readUserPreferences(session.user.id);
    return NextResponse.json(buildAvatarPayload(state?.ai, preferences?.assistantAvatar));
  }

  return NextResponse.json(buildAvatarPayload(state?.ai));
}

export async function PUT(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ error: 'Only administrators can edit assistant avatar.' }, { status: 403 });
    }

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
        memoryNotes,
        memorySections,
        avatarUpdatedAt: new Date().toISOString()
      }
    });

    const currentPreferences = await readUserPreferences(session.user.id);
    const savedPreferences = await writeUserPreferences(session.user.id, {
      ...currentPreferences,
      assistantAvatar: {
        name: avatarName,
        image: avatarImage,
        updatedAt: new Date().toISOString()
      }
    });

    return NextResponse.json(buildAvatarPayload(savedState?.ai, savedPreferences?.assistantAvatar));
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save avatar settings'
    }, {
      status: 400
    });
  }
}