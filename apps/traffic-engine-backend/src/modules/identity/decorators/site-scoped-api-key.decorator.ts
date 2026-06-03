import { SetMetadata } from '@nestjs/common';
import { IS_SITE_SCOPED_API_KEY_KEY } from '../identity.constants';

export const SiteScopedApiKey = () => SetMetadata(IS_SITE_SCOPED_API_KEY_KEY, true);
