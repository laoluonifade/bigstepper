import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

/** Square, face-centred, sized for the largest avatar the app shows (2× for sharp screens). */
const AVATAR_TRANSFORM = 'c_fill,g_face,w_320,h_320,q_auto,f_auto';
const POST_IMAGE_TRANSFORM = 'c_limit,w_1600,h_1600,q_auto,f_auto';

/**
 * Profile photos on Cloudinary through its signed upload API
 * (https://cloudinary.com/documentation/image_upload_api_reference). Each runner has one image,
 * overwritten in place, so a new photo never leaves an old one behind.
 */
@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.enabled && this.config.get('NODE_ENV') === 'production') {
      this.logger.error('CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not set, so profile photos are disabled');
    }
  }

  get enabled() {
    return Boolean(this.config.get('CLOUDINARY_CLOUD_NAME') && this.config.get('CLOUDINARY_API_KEY') && this.config.get('CLOUDINARY_API_SECRET'));
  }

  async uploadAvatar(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<string> {
    const result = await this.call<{ secure_url: string }>('upload', { public_id: this.publicId(userId), overwrite: 'true', invalidate: 'true' }, file);
    return result.secure_url.replace('/image/upload/', `/image/upload/${AVATAR_TRANSFORM}/`);
  }

  /** A photo on a Rant post, capped at 1600px wide for the feed. */
  async uploadPostImage(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<string> {
    const result = await this.call<{ secure_url: string }>('upload', { public_id: `jump/posts/${userId}/${randomUUID()}` }, file);
    return result.secure_url.replace('/image/upload/', `/image/upload/${POST_IMAGE_TRANSFORM}/`);
  }

  /**
   * A DM voice note. Browsers record WebM/Opus or MP4/AAC; the returned URL asks Cloudinary for MP3
   * so every browser can play it.
   */
  async uploadVoiceNote(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<string> {
    const result = await this.call<{ secure_url: string }>('upload', { public_id: `jump/voice/${userId}/${randomUUID()}` }, file, 'video');
    return result.secure_url.replace(/\.[a-z0-9]+$/i, '.mp3');
  }

  isOwnVoiceNote(userId: string, url: string) {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/video/upload/`) && url.includes(`/jump/voice/${userId}/`) && url.endsWith('.mp3');
  }

  /** Only URLs this service produced for the runner's own posts can be attached to a post. */
  isOwnPostImage(userId: string, url: string) {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/${POST_IMAGE_TRANSFORM}/`) && url.includes(`/jump/posts/${userId}/`);
  }

  async removeAvatar(userId: string) {
    await this.call('destroy', { public_id: this.publicId(userId), invalidate: 'true' });
  }

  private publicId(userId: string) {
    return `jump/avatars/${userId}`;
  }

  private async call<T>(action: 'upload' | 'destroy', params: Record<string, string>, file?: { buffer: Buffer; mimetype: string }, resourceType: 'image' | 'video' = 'image'): Promise<T> {
    if (!this.enabled) throw new ServiceUnavailableException('Photos aren’t available right now');
    const signed: Record<string, string> = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
    const toSign = Object.keys(signed)
      .sort()
      .map((key) => `${key}=${signed[key]}`)
      .join('&');
    const form = new FormData();
    for (const [key, value] of Object.entries(signed)) form.append(key, value);
    form.append('api_key', this.config.getOrThrow<string>('CLOUDINARY_API_KEY'));
    form.append('signature', createHash('sha1').update(toSign + this.config.getOrThrow<string>('CLOUDINARY_API_SECRET')).digest('hex'));
    if (file) form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), 'upload');

    // Cloudinary files audio under its "video" resource type.
    const response = await fetch(`https://api.cloudinary.com/v1_1/${this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME')}/${resourceType}/${action}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Cloudinary ${action} failed ${response.status}: ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException('Couldn’t upload your photo. Try again.');
    }
    return (await response.json()) as T;
  }
}
