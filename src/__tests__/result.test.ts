/**
 * Tests for Result Type Pattern
 */

import {
    Result,
    Ok,
    Err,
    isOk,
    isErr,
    unwrap,
    unwrapOr,
    unwrapOrElse,
    map,
    mapErr,
    andThen,
    orElse,
    match,
    fromPromise,
    fromThrowable,
    fromThrowableAsync,
    all,
    fromNullable,
    tap,
    tapErr
} from '../types/result';

describe('Result Creation', () => {
    test('Ok should create successful result', () => {
        const result = Ok(42);
        
        expect(result.ok).toBe(true);
        expect(result.value).toBe(42);
    });

    test('Err should create failed result', () => {
        const error = new Error('Failed');
        const result = Err(error);
        
        expect(result.ok).toBe(false);
        expect(result.error).toBe(error);
    });
});

describe('Result Type Guards', () => {
    test('isOk should identify Ok results', () => {
        const okResult = Ok(42);
        const errResult = Err(new Error());
        
        expect(isOk(okResult)).toBe(true);
        expect(isOk(errResult)).toBe(false);
    });

    test('isErr should identify Err results', () => {
        const okResult = Ok(42);
        const errResult = Err(new Error());
        
        expect(isErr(okResult)).toBe(false);
        expect(isErr(errResult)).toBe(true);
    });
});

describe('Result Unwrapping', () => {
    test('unwrap should return value for Ok', () => {
        const result = Ok(42);
        expect(unwrap(result)).toBe(42);
    });

    test('unwrap should throw for Err', () => {
        const error = new Error('Failed');
        const result = Err(error);
        
        expect(() => unwrap(result)).toThrow(error);
    });

    test('unwrapOr should return value for Ok', () => {
        const result = Ok(42);
        expect(unwrapOr(result, 0)).toBe(42);
    });

    test('unwrapOr should return default for Err', () => {
        const result = Err(new Error());
        expect(unwrapOr(result, 0)).toBe(0);
    });

    test('unwrapOrElse should compute default from error', () => {
        const result: Result<number, Error> = Err(new Error('Failed'));
        const value = unwrapOrElse(result, (error) => {
            return error.message.length;
        });
        
        expect(value).toBe(6); // length of "Failed"
    });
});

describe('Result Transformation', () => {
    test('map should transform Ok value', () => {
        const result = Ok(21);
        const doubled = map(result, x => x * 2);
        
        expect(isOk(doubled)).toBe(true);
        if (doubled.ok) {
            expect(doubled.value).toBe(42);
        }
    });

    test('map should preserve Err', () => {
        const error = new Error('Failed');
        const result: Result<number, Error> = Err(error);
        const doubled = map(result, x => x * 2);
        
        expect(isErr(doubled)).toBe(true);
        if (!doubled.ok) {
            expect(doubled.error).toBe(error);
        }
    });

    test('mapErr should transform error', () => {
        const result: Result<number, string> = Err('failed');
        const mapped = mapErr(result, err => new Error(err));
        
        expect(isErr(mapped)).toBe(true);
        if (!mapped.ok) {
            expect(mapped.error).toBeInstanceOf(Error);
            expect(mapped.error.message).toBe('failed');
        }
    });

    test('mapErr should preserve Ok', () => {
        const result = Ok(42);
        const mapped = mapErr(result, err => new Error(String(err)));
        
        expect(isOk(mapped)).toBe(true);
        if (mapped.ok) {
            expect(mapped.value).toBe(42);
        }
    });
});

describe('Result Chaining', () => {
    test('andThen should chain Ok results', () => {
        const result = Ok(21);
        const chained = andThen(result, x => Ok(x * 2));
        
        expect(isOk(chained)).toBe(true);
        if (chained.ok) {
            expect(chained.value).toBe(42);
        }
    });

    test('andThen should short-circuit on Err', () => {
        const error = new Error('Failed');
        const result: Result<number, Error> = Err(error);
        const chained = andThen(result, x => Ok(x * 2));
        
        expect(isErr(chained)).toBe(true);
        if (!chained.ok) {
            expect(chained.error).toBe(error);
        }
    });

    test('orElse should recover from Err', () => {
        const result: Result<number, string> = Err('failed');
        const recovered = orElse(result, err => Ok(0));
        
        expect(isOk(recovered)).toBe(true);
        if (recovered.ok) {
            expect(recovered.value).toBe(0);
        }
    });

    test('orElse should preserve Ok', () => {
        const result = Ok(42);
        const recovered = orElse(result, () => Ok(0));
        
        expect(isOk(recovered)).toBe(true);
        if (recovered.ok) {
            expect(recovered.value).toBe(42);
        }
    });
});

describe('Result Pattern Matching', () => {
    test('match should handle Ok branch', () => {
        const result = Ok(42);
        const output = match(result, {
            ok: val => `Success: ${val}`,
            err: err => `Error: ${err}`
        });
        
        expect(output).toBe('Success: 42');
    });

    test('match should handle Err branch', () => {
        const result: Result<number, string> = Err('failed');
        const output = match(result, {
            ok: val => `Success: ${val}`,
            err: err => `Error: ${err}`
        });
        
        expect(output).toBe('Error: failed');
    });
});

describe('Promise Conversion', () => {
    test('fromPromise should convert successful promise', async () => {
        const promise = Promise.resolve(42);
        const result = await fromPromise(promise);
        
        expect(isOk(result)).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    test('fromPromise should convert rejected promise', async () => {
        const error = new Error('Failed');
        const promise = Promise.reject(error);
        const result = await fromPromise(promise);
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBe(error);
        }
    });

    test('fromPromise should wrap non-Error rejections', async () => {
        const promise = Promise.reject('string error');
        const result = await fromPromise(promise);
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBeInstanceOf(Error);
            expect(result.error.message).toBe('string error');
        }
    });
});

describe('Function Conversion', () => {
    test('fromThrowable should convert successful function', () => {
        const fn = () => 42;
        const safeFn = fromThrowable(fn);
        const result = safeFn();
        
        expect(isOk(result)).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    test('fromThrowable should catch thrown errors', () => {
        const error = new Error('Failed');
        const fn = () => { throw error; };
        const safeFn = fromThrowable(fn);
        const result = safeFn();
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBe(error);
        }
    });

    test('fromThrowableAsync should convert async function', async () => {
        const fn = async () => 42;
        const safeFn = fromThrowableAsync(fn);
        const result = await safeFn();
        
        expect(isOk(result)).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    test('fromThrowableAsync should catch async errors', async () => {
        const error = new Error('Failed');
        const fn = async () => { throw error; };
        const safeFn = fromThrowableAsync(fn);
        const result = await safeFn();
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBe(error);
        }
    });
});

describe('Result Utilities', () => {
    test('all should combine successful results', () => {
        const results = [Ok(1), Ok(2), Ok(3)];
        const combined = all(results);
        
        expect(isOk(combined)).toBe(true);
        if (combined.ok) {
            expect(combined.value).toEqual([1, 2, 3]);
        }
    });

    test('all should fail if any result fails', () => {
        const error = new Error('Failed');
        const results: Result<number, Error>[] = [Ok(1), Err(error), Ok(3)];
        const combined = all(results);
        
        expect(isErr(combined)).toBe(true);
        if (!combined.ok) {
            expect(combined.error).toBe(error);
        }
    });

    test('fromNullable should convert non-null value', () => {
        const result = fromNullable(42, new Error('Was null'));
        
        expect(isOk(result)).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    test('fromNullable should handle null', () => {
        const error = new Error('Was null');
        const result = fromNullable(null, error);
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBe(error);
        }
    });

    test('fromNullable should handle undefined', () => {
        const error = new Error('Was undefined');
        const result = fromNullable(undefined, error);
        
        expect(isErr(result)).toBe(true);
        if (!result.ok) {
            expect(result.error).toBe(error);
        }
    });

    test('tap should execute side effect for Ok', () => {
        let sideEffect = 0;
        const result = Ok(42);
        const tapped = tap(result, val => { sideEffect = val; });
        
        expect(sideEffect).toBe(42);
        expect(tapped).toBe(result);
    });

    test('tap should not execute for Err', () => {
        let sideEffect = 0;
        const result: Result<number, Error> = Err(new Error());
        const tapped = tap(result, val => { sideEffect = val; });
        
        expect(sideEffect).toBe(0);
        expect(tapped).toBe(result);
    });

    test('tapErr should execute side effect for Err', () => {
        let sideEffect = '';
        const error = new Error('Failed');
        const result: Result<number, Error> = Err(error);
        const tapped = tapErr(result, err => { sideEffect = err.message; });
        
        expect(sideEffect).toBe('Failed');
        expect(tapped).toBe(result);
    });

    test('tapErr should not execute for Ok', () => {
        let sideEffect = '';
        const result = Ok(42);
        const tapped = tapErr(result, (err: Error) => { sideEffect = err.message; });
        
        expect(sideEffect).toBe('');
        expect(tapped).toBe(result);
    });
});
