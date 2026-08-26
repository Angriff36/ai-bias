export async function saveThenPublish<Local, Published>(
  saveLocal: () => Promise<Local>,
  publish: () => Promise<Published>,
): Promise<{ local: Local; publication: Published | { error: string } }> {
  const local = await saveLocal()
  try {
    return { local, publication: await publish() }
  } catch (error) {
    return { local, publication: { error: error instanceof Error ? error.message : 'Public publication failed.' } }
  }
}
