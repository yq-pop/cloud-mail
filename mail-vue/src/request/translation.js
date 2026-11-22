import http from '@/axios/index.js';

export function translateEmail(emailId, target = 'zh') {
  return http.post('/email/translate', { emailId, target }, { timeout: 30000 });
}
