import { jsonResponse, requestJson } from '../_shared/http.ts';
import { supabaseAdmin, supabaseForRequest } from '../_shared/supabaseClients.ts';

type DeleteAccountRequest = {
  confirmation?: unknown;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const userClient = supabaseForRequest(req);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'authentication_required' }, 401);

    const body = await requestJson(req) as DeleteAccountRequest;
    if (body.confirmation !== 'DELETE') {
      return jsonResponse({ error: 'confirmation_required' }, 400);
    }

    const { error: deleteError } = await supabaseAdmin().auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return jsonResponse({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion failed.';
    const malformed = /content-type|json/i.test(message);
    return jsonResponse(
      { error: malformed ? 'invalid_request' : 'account_deletion_failed' },
      malformed ? 400 : 500,
    );
  }
});
