import { Link, usePathname, useRouter, type LinkProps } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, type PropsWithChildren } from 'react';

type Guard = (proceed: () => void) => void;
type Context = { register: (id: string, guard: Guard) => () => void; request: (proceed: () => void) => boolean };
const NavigationGuardContext = createContext<Context | null>(null);

export function NavigationGuardProvider({ children }: PropsWithChildren) {
  const current = useRef<{ id: string; guard: Guard } | null>(null);
  const register = useCallback((id: string, guard: Guard) => {
    current.current = { id, guard };
    return () => { if (current.current?.id === id) current.current = null; };
  }, []);
  const request = useCallback((proceed: () => void) => {
    if (!current.current) return false;
    current.current.guard(proceed);
    return true;
  }, []);
  const value = useMemo(() => ({ register, request }), [register, request]);
  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useAppNavigationBlocker(dirty: boolean, guard: Guard) {
  const context = useContext(NavigationGuardContext);
  const id = useId();
  useEffect(() => {
    if (!context || !dirty) return;
    return context.register(id, guard);
  }, [context, dirty, guard, id]);
}

// Shell links can push a new route without removing its history entry. Combine
// this guard with Expo's removal/back/unload prevention inside the editor.
export function GuardedLink(props: LinkProps) {
  const context = useContext(NavigationGuardContext);
  const router = useRouter();
  const pathname = usePathname();
  return <Link {...props} onPress={(event) => {
    props.onPress?.(event);
    if (event.defaultPrevented) return;
    if (props.href === pathname) return;
    const blocked = context?.request(() => {
      if (props.replace) router.replace(props.href);
      else if (props.push) router.push(props.href);
      else router.navigate(props.href);
    });
    if (blocked) event.preventDefault();
  }} />;
}
