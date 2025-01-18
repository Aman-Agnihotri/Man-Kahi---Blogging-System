import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRATION } from "./constants";

/**
 * Generates a JSON Web Token for a given user id.
 *
 * @param {string} userId - the user id for which to generate a token
 * @returns {string} a JSON Web Token that can be used to authenticate the user
 */
export const generateToken = (userId: string): string => {
    return jwt.sign({id: userId }, JWT_SECRET, {algorithm: "HS512" , expiresIn: JWT_EXPIRATION });
}

/**
 * Verifies a JSON Web Token and decodes the user id from it.
 *
 * @param {string} token - the JSON Web Token to verify
 * 
 * @throws {JsonWebTokenError} if the token is invalid
 * @throws {TokenExpiredError} if the token has expired
 */
export const verifyToken = (token: string) => {
    return jwt.verify(token, JWT_SECRET);
}

export { JsonWebTokenError, TokenExpiredError }