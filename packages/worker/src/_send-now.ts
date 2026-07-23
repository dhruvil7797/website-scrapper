import { runMailer } from './pipeline/mailer.js';
runMailer().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
