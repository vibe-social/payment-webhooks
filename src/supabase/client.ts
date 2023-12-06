import { config } from "dotenv"
config()

import { Database } from './types.js'
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
	throw new Error('Missing env.SUPABASE_URL or env.SUPABASE_ANON_KEY')
}

const supabase = createClient<Database>(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_ANON_KEY
)

export default supabase