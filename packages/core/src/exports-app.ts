/**
 * What `index.ts` re-exports of `app/`: the builders — `defineMiddleware`,
 * `definePlugin`, … — and the types of an app's methods, definitions and
 * context, which an app's inferred type names and a plugin is written
 * against.
 */
export type {
	AroundMethod,
	ParserMethod,
	RequestHookMethod,
	ResponseHookMethod,
	StartHookMethod,
	StopHookMethod,
} from './app/app-hooks';
export type {
	GroupMethod,
	PluginForms,
	UseMethod,
} from './app/compose-methods';
export { defineHook, defineWrap } from './app/define-hook';
export { defineMiddleware } from './app/define-middleware';
export { definePlugin, defineRoutes } from './app/define-plugin';
export type {
	AroundHook,
	RefusalHandler,
	RefusalHandlersByKind,
	RefusalHook,
	RequestHook,
	ResponseHook,
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
	PluginMethod,
	RequiredIn,
} from './app/plugin-method';
export type * from './app/register';
export type {
	AppWithRoute,
	RouteOptions,
} from './app/route-forms';
export type {
	DeprecatedForms,
	RouteApp,
	RouteMethod,
} from './app/route-method';
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
	ErrorMethod,
	WrapMethod,
} from './app/scope-methods';
export type { ListenMethod, RequestMethod } from './app/serving-methods';
export type {
	AlxiaOptions,
	AnyAlxia,
	ContextOf,
	ListenOptions,
	Plugin,
	RefusalMethod,
} from './app/signatures';
export type {
	SocketForms,
	SocketOptions,
} from './app/socket-forms';
export type {
	DeprecatedSocketForms,
	SocketMethod,
} from './app/socket-method';
export type { SocketOptionsForms } from './app/socket-options';
export type {
	FileMethod,
	PageMethod,
	StaticMethod,
} from './app/static-methods';
export type {
	AddedBy,
	AnyRouteHook,
	BaseContext,
	BodyLimited,
	BodyLimitShortcut,
	BuiltinMark,
	Context,
	DeclaredRefusal,
	DeclaredReply,
	Empty,
	FallsBack,
	HandlerResult,
	HookContext,
	HookProvided,
	KindFallsBack,
	KindRefusalsOf,
	MadeByDefineMiddleware,
	MaxRouteHooks,
	MaybePromise,
	Method,
	Middleware,
	MiddlewareContext,
	MiddlewareMark,
	MiddlewareResult,
	MiddlewareReturn,
	Next,
	NextFunction,
	NoHookYet,
	OneKind,
	ProvidedBy,
	RawRequestParts,
	RedirectFunction,
	RefusalResponses,
	RefusalSchema,
	RefusalsOf,
	Refusing,
	RefusingKind,
	RepliesBy,
	RequestContext,
	RequiresOf,
	Requiring,
	RequiringContext,
	ResponseCookies,
	ResponseSchemas,
	ResponseSettings,
	RouteDetail,
	RouteHook,
	RouteHookBase,
	RouteSchema,
	RouteWrap,
	ThenShortcuts,
	ThreadHooks,
	TypedReplyFunction,
	TypedShortcuts,
	ValidSchema,
} from './app/types';
export type {
	AddingNothing,
	AppAfterUse,
	PathMiddleware,
	ScopeMiddleware,
	ScopePathAt,
	UseForms,
} from './app/use-forms';
