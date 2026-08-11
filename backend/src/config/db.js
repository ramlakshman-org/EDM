import { MongoClient } from 'mongodb';

// Two independent connections, mirroring the original app:
//   voterDb  -> voter roll (ass_1..ass_234)
//   appDb    -> app data (users, tbl_assembly_consitituency, payments, ...)
let voterClient, appClient;
let voterDb = null;
let appDb = null;

export async function connectDbs() {
  const {
    MONGO_VOTER_URL, MONGO_VOTER_DB_NAME,
    MONGO_APP_URL, MONGO_APP_DB_NAME,
  } = process.env;

  try {
    voterClient = new MongoClient(MONGO_VOTER_URL, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
    await voterClient.connect();
    voterDb = voterClient.db(MONGO_VOTER_DB_NAME);
    console.log(`[db] voter_db connected (${MONGO_VOTER_DB_NAME})`);
  } catch (e) {
    console.warn(`[db] voter_db connection failed: ${e.message} (voter features will report offline)`);
    voterDb = null;
  }

  try {
    appClient = new MongoClient(MONGO_APP_URL, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
    await appClient.connect();
    appDb = appClient.db(MONGO_APP_DB_NAME);
    console.log(`[db] election_app connected (${MONGO_APP_DB_NAME})`);
  } catch (e) {
    console.warn(`[db] election_app connection failed: ${e.message}`);
    appDb = null;
  }
}

export function getVoterDb() {
  if (!voterDb) throw new Error('VOTER_DB_OFFLINE');
  return voterDb;
}
export function isVoterDbOnline() {
  return !!voterDb;
}
export function getAppDb() {
  if (!appDb) throw new Error('APP_DB_OFFLINE');
  return appDb;
}
export function isAppDbOnline() {
  return !!appDb;
}

export async function closeDbs() {
  await voterClient?.close().catch(() => {});
  await appClient?.close().catch(() => {});
}
