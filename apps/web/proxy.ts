import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/blocked']);
const isApi = createRouteMatcher(['/api(.*)']);

/**
 * Sessão Clerk em todas as rotas. Páginas privadas redirecionam ao /sign-in;
 * APIs respondem 401 JSON no próprio handler (withUser), sem redirect.
 * Papéis (admin/user) são checados no servidor a partir do Neon, não aqui.
 */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req) && !isApi(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
