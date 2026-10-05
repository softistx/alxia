/**
 * What `index.ts` re-exports of `app/`: the builders — `defineMiddleware`,
 * `definePlugin`, … — and the types of an app's methods, definitions and
 * context, which an app's inferred type names and a plugin is written
 * against.
 */
export type {
	ParserMethod,
	StartHookMethod,
	StopHookMethod,
} from './app/app-hooks';
export type { GroupMethod, UseMethod } from './app/compose-methods';
export {
	defineAppMiddleware,
	defineMiddleware,
} from './app/define-middleware';
export { definePlugin, defineRoutes } from './app/define-plugin';
export type {
	RouteDefinition,
	SocketDefinition,
	StartHook,
	StopHook,
} from './app/definition';
export type { OperationForms } from './app/operation-forms';
export type {
	OperationApp,
	OperationOptions,
	OperationParts,
	OperationResponds,
	OperationValidate,
} from './app/operation-types';
export type {
	Mounted,
	MountedIn,
	PluginMethod,
	RequiredIn,
} from './app/plugin-method';
export type * from './app/register';
export type {
	AppWithRoute,
	RouteOptions,
} from './app/route-forms';
export type { RouteApp, RouteMethod } from './app/route-method';
export type { MiddlewareForms } from './app/route-middlewares';
export type {
	CheckedOperation,
	OperationMethod,
	OperationSchema,
	RouteOperation,
} from './app/route-operation';
export type { OptionsForms } from './app/route-options';
export type {
	BodyLimitMethod,
	DecorateMethod,
	DeriveMethod,
} from './app/scope-methods';
export type { ListenMethod, RequestMethod } from './app/serving-methods';
export type {
	AlxiaOptions,
	AnyAlxia,
	ContextOf,
	ListenInfo,
	ListenOptions,
	Plugin,
} from './app/signatures';
export type {
	SocketForms,
	SocketOptions,
} from './app/socket-forms';
export type { SocketMethod } from './app/socket-method';
export type { SocketOptionsForms } from './app/socket-options';
export type {
	FileMethod,
	PageMethod,
	StaticMethod,
} from './app/static-methods';
export type { TooMany, TooManyMiddlewares } from './app/too-many';
export type {
	BaseContext,
	BuiltinMark,
	Context,
	DeclaredReply,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	Middleware,
	MiddlewareContext,
	MiddlewareResult,
	MiddlewareReturn,
	Next,
	NextFunction,
	NoMiddlewareYet,
	ProvidedBy,
	RedirectFunction,
	RequestContext,
	RequiresOf,
	Requiring,
	RequiringContext,
	ResponseCookies,
	ResponseSchemas,
	ResponseSettings,
	RouteDetail,
	RouteSchema,
	TypedReplyFunction,
	TypedShortcuts,
	ValidSchema,
} from './app/types';
export type { Composable, Composed, ComposedReads } from './app/types/composed';
export type {
	AddingNothing,
	AppAfterUse,
	PathMiddleware,
	ScopeMiddleware,
	ScopePathAt,
	UseForms,
} from './app/use-forms';
