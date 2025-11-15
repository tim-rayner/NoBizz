// ============================================================================
// Redis Client (Upstash REST API)
// ============================================================================

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  setnx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
}

interface RedisConfig {
  baseUrl: string;
  token: string;
}

async function executeCommand(
  config: RedisConfig,
  command: string[]
): Promise<any> {
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Redis request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result;
}

export function createRedisClient(): RedisClient {
  const redisUrl = Deno.env.get('REDIS_REST_URL');
  const redisToken = Deno.env.get('REDIS_REST_TOKEN');

  if (!redisUrl || !redisToken) {
    throw new Error('REDIS_REST_URL and REDIS_REST_TOKEN must be set');
  }

  const config: RedisConfig = {
    baseUrl: redisUrl.replace(/\/$/, ''),
    token: redisToken,
  };

  return {
    async get(key: string): Promise<string | null> {
      try {
        const result = await executeCommand(config, ['GET', key]);
        return result.result || null;
      } catch (error) {
        console.error(`Redis GET error for key ${key}:`, error);
        return null;
      }
    },

    async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
      try {
        const command = ttlSeconds
          ? ['SET', key, value, 'EX', ttlSeconds.toString()]
          : ['SET', key, value];

        const result = await executeCommand(config, command);
        return result.result === 'OK';
      } catch (error) {
        console.error(`Redis SET error for key ${key}:`, error);
        return false;
      }
    },

    async setnx(
      key: string,
      value: string,
      ttlSeconds: number
    ): Promise<boolean> {
      try {
        // SETNX with TTL: SET key value NX EX ttl
        const command = ['SET', key, value, 'NX', 'EX', ttlSeconds.toString()];
        const result = await executeCommand(config, command);

        // If result is null, key already exists (NX condition failed)
        return result.result === 'OK';
      } catch (error) {
        console.error(`Redis SETNX error for key ${key}:`, error);
        return false;
      }
    },

    async del(key: string): Promise<boolean> {
      try {
        const result = await executeCommand(config, ['DEL', key]);
        return result.result > 0;
      } catch (error) {
        console.error(`Redis DEL error for key ${key}:`, error);
        return false;
      }
    },
  };
}
