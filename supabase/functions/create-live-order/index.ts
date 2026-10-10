import { handleLiveCheckout } from '../_shared/liveCheckout.ts';
Deno.serve(request => handleLiveCheckout(request, 'create'));
