import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { createAssistantKnowledgeDocument, deleteAssistantKnowledgeDocument, readAssistantKnowledgeOverview } from '@/server/assistant-knowledge-store';

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const forbidden = () => NextResponse.json({ error: 'Admin access required' }, { status: 403 });

export async function GET() {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();

  const overview = await readAssistantKnowledgeOverview();
  return NextResponse.json({
    ok: true,
    ...overview
  });
}

export async function POST(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();
  if (!isAdminRole(session?.user?.role)) return forbidden();

  const formData = await request.formData();
  const files = [...formData.getAll('files'), formData.get('file')].filter(Boolean);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Upload at least one PDF or text file.' }, { status: 400 });
  }

  const acceptedExtensions = new Set(['.pdf', '.txt', '.md', '.csv']);
  const uploadedDocuments = [];

  for (const file of files) {
    const fileName = String(file?.name || '').trim();
    const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (!acceptedExtensions.has(extension)) {
      return NextResponse.json({ error: `Unsupported file type: ${fileName || 'unknown'}. Use PDF, TXT, MD, or CSV.` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await createAssistantKnowledgeDocument({
      fileName,
      mimeType: String(file?.type || '').trim() || 'application/octet-stream',
      size: Number(file?.size || buffer.length || 0),
      buffer
    });
    uploadedDocuments.push(document);
  }

  const overview = await readAssistantKnowledgeOverview();
  return NextResponse.json({
    ok: true,
    uploadedDocuments,
    ...overview
  });
}

export async function DELETE(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();
  if (!isAdminRole(session?.user?.role)) return forbidden();

  const documentId = String(request.nextUrl.searchParams.get('id') || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document id is required.' }, { status: 400 });
  }

  await deleteAssistantKnowledgeDocument(documentId);
  const overview = await readAssistantKnowledgeOverview();
  return NextResponse.json({
    ok: true,
    ...overview
  });
}
