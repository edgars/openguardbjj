import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/blocked', '/explorar(.*)']);
const isApi = createRouteMatcher(['/api(.*)']);

/**
 * Sessão Clerk em todas as rotas.
 * - /explorar e /api/public: catálogo aberto (sem login).
 * - "/" sem login → /explorar (vitrine pública); com login → biblioteca.
 * - Demais páginas exigem login; APIs respondem 401 JSON no próprio handler (withUser).
 * Papéis (admin/user) são checados no servidor a partir do Neon, não aqui.
 */
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req) || isApi(req)) return;
  if (req.nextUrl.pathname === '/') {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL('/explorar', req.url));
    return;
  }
  await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
