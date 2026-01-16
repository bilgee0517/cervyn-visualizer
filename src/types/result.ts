/**
 * Result Type Pattern
 * 
 * Provides a type-safe way to handle success/failure without exceptions or null returns.
 * Inspired by Rust's Result<T, E> and functional programming patterns.
 */

/**
 * Result type representing either success (Ok) or failure (Err)
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Success variant of Result
 */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

/**
 * Failure variant of Result
 */
export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

/**
 * Create a successful Result
 */
export function Ok<T>(value: T): Ok<T> {
    return { ok: true, value };
}

/**
 * Create a failed Result
 */
export function Err<E>(error: E): Err<E> {
    return { ok: false, error };
}

/**
 * Type guard to check if Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.ok === true;
}

/**
 * Type guard to check if Result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
    return result.ok === false;
}

/**
 * Unwrap a Result, returning the value or throwing the error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (isOk(result)) {
        return result.value;
    }
    throw result.error;
}

/**
 * Unwrap a Result, returning the value or a default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    if (isOk(result)) {
        return result.value;
    }
    return defaultValue;
}

/**
 * Unwrap a Result, returning the value or computing a default from the error
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
    if (isOk(result)) {
        return result.value;
    }
    return fn(result.error);
}

/**
 * Map the value of an Ok Result, leaving Err unchanged
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (isOk(result)) {
        return Ok(fn(result.value));
    }
    return result;
}

/**
 * Map the error of an Err Result, leaving Ok unchanged
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (isErr(result)) {
        return Err(fn(result.error));
    }
    return result;
}

/**
 * Chain Result-returning operations (flatMap/bind)
 */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    if (isOk(result)) {
        return fn(result.value);
    }
    return result;
}

/**
 * Chain error recovery operations
 */
export function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
    if (isErr(result)) {
        return fn(result.error);
    }
    return result;
}

/**
 * Match pattern for Result (like Rust's match or switch expressions)
 */
export function match<T, E, U>(
    result: Result<T, E>,
    handlers: {
        ok: (value: T) => U;
        err: (error: E) => U;
    }
): U {
    if (isOk(result)) {
        return handlers.ok(result.value);
    }
    return handlers.err(result.error);
}

/**
 * Convert a Promise to a Result, catching any errors
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
    try {
        const value = await promise;
        return Ok(value);
    } catch (error) {
        return Err(error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Convert a throwing function to a Result-returning function
 */
export function fromThrowable<T, Args extends unknown[]>(
    fn: (...args: Args) => T
): (...args: Args) => Result<T, Error> {
    return (...args: Args) => {
        try {
            return Ok(fn(...args));
        } catch (error) {
            return Err(error instanceof Error ? error : new Error(String(error)));
        }
    };
}

/**
 * Convert an async throwing function to a Result-returning function
 */
export function fromThrowableAsync<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<Result<T, Error>> {
    return async (...args: Args) => {
        try {
            const value = await fn(...args);
            return Ok(value);
        } catch (error) {
            return Err(error instanceof Error ? error : new Error(String(error)));
        }
    };
}

/**
 * Combine multiple Results into a single Result with an array of values
 * Returns Err if any Result is Err, otherwise Ok with array of values
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
    const values: T[] = [];
    
    for (const result of results) {
        if (isErr(result)) {
            return result;
        }
        values.push(result.value);
    }
    
    return Ok(values);
}

/**
 * Convert a nullable value to a Result
 */
export function fromNullable<T>(value: T | null | undefined, error: Error): Result<T, Error> {
    if (value === null || value === undefined) {
        return Err(error);
    }
    return Ok(value);
}

/**
 * Tap into Ok value without modifying the Result (useful for side effects like logging)
 */
export function tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> {
    if (isOk(result)) {
        fn(result.value);
    }
    return result;
}

/**
 * Tap into Err error without modifying the Result (useful for side effects like logging)
 */
export function tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> {
    if (isErr(result)) {
        fn(result.error);
    }
    return result;
}
