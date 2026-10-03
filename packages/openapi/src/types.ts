import type { Method, RouteDefinition } from '@alxia/core';
import type { Converter, JsonSchema } from './json-schema';

export interface OpenApiInfo {
	readonly title: string;
	readonly version: string;
	readonly description?: string;
}

export interface OpenApiOptions {
	readonly info: OpenApiInfo;
	readonly servers?: readonly {
		readonly url: string;
		readonly description?: string;
	}[];
	/** Converts a schema whose vendor carries no Standard JSON Schema. */
	readonly convert?: Converter;
	/** Leaves a route out of the document. */
	readonly exclude?: (route: RouteDefinition) => boolean;
}

export interface OpenApiDocument {
	readonly openapi: '3.2.0';
	readonly info: OpenApiInfo;
	readonly servers?: readonly {
		readonly url: string;
		readonly description?: string;
	}[];
	readonly paths: Record<string, Partial<Record<Lowercase<Method>, Operation>>>;
	readonly components: { readonly schemas: Record<string, JsonSchema> };
}

export interface Operation {
	operationId: string;
	summary?: string;
	description?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: ParameterObject[];
	requestBody?: {
		required: boolean;
		content: Record<string, { schema: JsonSchema }>;
	};
	responses: Record<string, ResponseObject>;
}

export interface ParameterObject {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	required: boolean;
	schema: JsonSchema;
	description?: string;
}

/** A body's schema; `itemSchema` for each item of a sequence, an event stream's events. */
export interface MediaType {
	schema?: JsonSchema;
	itemSchema?: JsonSchema;
}

export interface ResponseObject {
	description: string;
	content?: Record<string, MediaType>;
}
