import type { SourceFileMetadata } from '../types';

const SOURCE_FILE_REGEX = /<!--\s*Source file:\s*([^>]+)\s*-->/;

/**
 * Extracts source file metadata from markdown content.
 * The metadata is embedded as an HTML comment: <!-- Source file: filename.pdf -->
 */
export function extractSourceFileMetadata(content: string): SourceFileMetadata | null {
  const match = content.match(SOURCE_FILE_REGEX);
  if (match && match[1]) {
    return { originalFilename: match[1].trim() };
  }
  return null;
}

/**
 * Removes the source file metadata comment from markdown content.
 * Useful when saving the markdown without the metadata.
 */
export function removeSourceFileMetadata(content: string): string {
  return content.replace(SOURCE_FILE_REGEX, '').trimStart();
}