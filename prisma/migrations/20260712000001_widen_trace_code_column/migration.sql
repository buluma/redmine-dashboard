-- traces.code was VarChar(100) but live data includes full exception-trace
-- source snippets (observed up to ~23k chars) — widen to match its Text
-- siblings (backtrace, context) in the same model.
ALTER TABLE "traces" ALTER COLUMN "code" TYPE TEXT;
