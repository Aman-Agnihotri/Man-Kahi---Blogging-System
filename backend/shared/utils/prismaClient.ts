import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { DATABASE_PROVIDER } from "../utils/constants";
import logger from "../utils/logger";

const provider = DATABASE_PROVIDER;

const existingSchema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!existingSchema) {
    logger.warn('prisma/schema.prisma not found');
    throw new Error('prisma/schema.prisma not found');
}

const datasourceProviderRegex = /datasource\s+db\s*{[^}]*provider\s*=\s*"[^"]*"[^}]*}/;

const providerRegex = /provider\s*=\s*"[^"]*"/;

/**
 * Get the current provider defined in the schema.prisma file.
 * @param schema - The contents of the schema.prisma file
 * @returns The provider currently defined in the schema.prisma file, or null if no provider is found
 */
function getCurrentProvider(schema: string): string | null {
    const match = datasourceProviderRegex.exec(schema);
    const providerMatch = providerRegex.exec(match?.[0] ?? '');
    return providerMatch ? providerMatch[0] : null;
}

/**
 * Generate the Prisma Client.
 *
 * This function executes the "npx prisma generate" command to generate the Prisma Client.
 * If the command fails, it will log the error and exit the process.
 */
function generateClient() {
    try{
        logger.debug("Generating new Prisma Client...");
        exec("npx prisma generate", { encoding: "utf8" });
        logger.debug("Prisma Client generated successfully.");
    } catch(err){
        logger.error("Fatal Error! Error generating Prisma Client: ", err);
        process.exit(1);
    }
}

if (getCurrentProvider(existingSchema) !== `provider = "${provider}"`) {

    const updatedSchema = existingSchema.replace(datasourceProviderRegex, (match) => {
        return match.replace(providerRegex, `provider = "${provider}"`);
    });
    
    fs.writeFileSync('prisma/schema.prisma', updatedSchema);

    generateClient();

}

export const prisma = new PrismaClient();