/**
 * The Awilix convenience face: register the seven port tokens in one typed call.
 *
 * The module declares its ports (`PORTS`) and the runtime reads a plain deps object;
 * this face registers that same table into an Awilix container, so the shortest path
 * is `runtimeContainer({...})` → `createScope()` → `createRuntime(scope.cradle)`
 * The DI base is Awilix and nothing else: the output is a standard
 * `AwilixContainer` and the registrations are standard resolvers, so every native
 * door stays open — `register`, `createScope`, `cradle`, lifetime overrides
 * No resolver, lifetime, or disposal machinery is re-implemented here.
 *
 * A token whose factory is absent registers the module's declared default
 * (`asValue(undefined)`): a cradle read then answers exactly what the functional face
 * answers — the runtime's `infra` refusal for a missing required token, and the
 * documented fallback for an optional one — instead of a container-side throw.
 * The container itself stays CLASSIC + strict, so a name outside the seven
 * that nobody registered is still refused loudly.
 *
 * @module
 */

import {
  type AwilixContainer,
  InjectionMode,
  Lifetime,
  type Resolver,
  asFunction,
  asValue,
  createContainer,
} from 'awilix';
import type { PortRow, PortToken, RuntimeDeps } from '../contract/ports.js';
import { PORTS } from '../contract/ports.js';

/** The port each token carries — the shape a factory for that token answers. Read from the
 *  runtime's own deps row for the token, with the optional marker stripped (a factory answers the
 *  port itself, never the `undefined` a missing one answers): a token the port table declares
 *  without a deps row cannot be read out of `RuntimeDeps`, so the token union fails to index it
 *  and the error lands here. */
export type PortType<K extends PortToken> = Exclude<RuntimeDeps[K], undefined>;

/** The cradle the registrations fill: the runtime's own deps rows — the three required tokens and
 *  the four optional ones (a token with no factory answers `undefined` — the declared default) —
 *  plus whatever else the consumer registers (per-call rows such as a journal handle). A token the
 *  port table declares without a deps row fails `PortType` above, so the cradle cannot drift from
 *  the table either. */
export type RuntimeCradle = RuntimeDeps & { [extra: string]: unknown };

/** A consumer-supplied factory for one token: it receives the resolving scope's cradle,
 *  so a scoped row reads the per-call rows the consumer registered on that scope. */
export type PortFactory<K extends PortToken> = (cradle: RuntimeCradle) => PortType<K>;

/** The table row one token carries: a token the union holds without a row is a table drift, and
 *  the container refuses to wire it rather than answering a lifetime nobody declared. */
function portRow(token: PortToken): PortRow {
  const row = PORTS[token];
  if (row === undefined) {
    throw new Error(`PORTS carries no row for '${token}' — the table and the token union drifted`);
  }
  return row;
}

/** The table's spine: the tokens in `PORTS` order — read from the table itself, so a token the
 *  table gains or loses is walked without a second list to keep in step. */
const TOKENS = Object.keys(PORTS) as readonly PortToken[];

/**
 * The seven tokens as an Awilix registration table: a supplied factory registers at the
 * lifetime `PORTS` recommends (`singleton` → `.singleton()`, otherwise `.scoped()`), and
 * an absent one registers the declared default. The factories receive the resolving
 * scope's cradle, so a scoped row can read the per-call rows registered on that scope.
 */
export function runtimeRegistrations(
  factories: Partial<{ [K in PortToken]: PortFactory<K> }>,
): Record<string, Resolver<unknown>> {
  const registrations: Record<string, Resolver<unknown>> = {};
  for (const token of TOKENS) {
    const factory: PortFactory<PortToken> | undefined = factories[token];
    registrations[token] =
      factory === undefined
        ? asValue(undefined)
        : asFunction(factory, {
            lifetime: portRow(token).lifetime === 'singleton' ? Lifetime.SINGLETON : Lifetime.SCOPED,
            injectionMode: InjectionMode.PROXY,
          });
  }
  return registrations;
}

/**
 * The recommended entry: a CLASSIC + strict container with the seven tokens registered
 * (`runtimeRegistrations`). The container is standard Awilix — the consumer scopes it
 * (`createScope()`), reads the cradle, and keeps registering rows of their own.
 */
export function runtimeContainer(
  factories?: Partial<{ [K in PortToken]: PortFactory<K> }>,
): AwilixContainer<RuntimeCradle> {
  const container = createContainer<RuntimeCradle>({ injectionMode: InjectionMode.CLASSIC, strict: true });
  container.register(runtimeRegistrations(factories ?? {}));
  return container;
}
