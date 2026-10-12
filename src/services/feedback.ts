import { loadSupabase } from '../lib/supabaseConfig';
import { requestCartCaptcha } from './cartCaptcha';

export interface FeedbackInput {
  message: string;
  category: 'general' | 'suggestion' | 'website' | 'product';
  name: string;
  email: string;
  wantsReply: boolean;
  requestId: string;
}
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  if (input.message.trim().length < 10 || input.message.trim().length > 3000) {
    throw new Error('Enter feedback between 10 and 3,000 characters.');
  }
  if (input.wantsReply && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error('Enter a valid email if you would like a reply.');
  }
  const client = await loadSupabase();
  if (!client) throw new Error('Feedback requires an online connection.');
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore feedback session: ${sessionError.message}`);
  if (!data.session) {
    const captchaToken = await requestCartCaptcha();
    const { error } = await client.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
    if (error) throw new Error(`Unable to prepare feedback: ${error.message}`);
  }
  const { data: receipt, error } = await client.rpc('submit_store_feedback', {
    request_id: input.requestId, feedback_message: input.message.trim(), feedback_category: input.category,
    contact_name: input.name.trim(), contact_email: input.wantsReply ? input.email.trim().toLowerCase() : '',
    wants_reply: input.wantsReply,
  });
  if (error) throw new Error(`Unable to submit feedback: ${error.message}`);
  if (receipt !== input.requestId) throw new Error('Invalid feedback receipt. Retry without changing your message.');
}
