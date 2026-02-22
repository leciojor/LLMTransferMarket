import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The actual DDL schema from the user's database, sent as context to OpenAI
const DATABASE_SCHEMA_DDL = `
CREATE TABLE team (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(255) NOT NULL,
  date_founded DATE NOT NULL
);

CREATE TABLE contract (
  id BIGSERIAL PRIMARY KEY,
  salary DOUBLE PRECISION NOT NULL,
  gloves DOUBLE PRECISION NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL
);

CREATE TABLE award (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  date TIMESTAMP NOT NULL,
  description VARCHAR(255) NOT NULL
);

CREATE TABLE championship (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL
);

CREATE TABLE club_transfer (
  id BIGSERIAL PRIMARY KEY,
  borrowing BOOLEAN NOT NULL,
  new_contract BIGINT NOT NULL REFERENCES contract(id),
  date TIMESTAMP NOT NULL
);

CREATE TABLE person (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age BIGINT NOT NULL,
  current_club BIGINT REFERENCES team(id),
  most_recent_club_transfer BIGINT REFERENCES club_transfer(id),
  current_contract BIGINT REFERENCES contract(id),
  birthday DATE NOT NULL
);

CREATE TABLE player (
  id BIGSERIAL PRIMARY KEY,
  position VARCHAR(50) NOT NULL,
  current_borrowed_club BIGINT REFERENCES team(id),
  person_id BIGINT NOT NULL REFERENCES person(id)
);

CREATE TABLE coach (
  id BIGSERIAL PRIMARY KEY,
  person_id BIGINT NOT NULL REFERENCES person(id)
);

CREATE TABLE championship_title (
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NOT NULL REFERENCES championship(id),
  date DATE NOT NULL,
  season VARCHAR(255) NOT NULL
);

CREATE TABLE player_award (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES player(id),
  award_id BIGINT NOT NULL REFERENCES award(id)
);

CREATE TABLE player_championship_title (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES player(id),
  championship_title_id BIGINT NOT NULL REFERENCES championship_title(id)
);

CREATE TABLE person_club_transfer (
  id BIGSERIAL PRIMARY KEY,
  person_id BIGINT NOT NULL REFERENCES person(id),
  club_transfer_id BIGINT NOT NULL REFERENCES club_transfer(id)
);

CREATE TABLE team_championship_title (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES team(id),
  championship_title_id BIGINT NOT NULL REFERENCES championship_title(id)
);
`;

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `OpenAI API error: ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "A valid question is required." },
        { status: 400 }
      );
    }

    // ── Step 1: Send user question + schema to OpenAI, get SQL ──
    const sqlSystemPrompt = `You are a PostgreSQL expert. Given the following database schema, generate a single SELECT query that answers the user's question. Return ONLY the raw SQL query, no markdown, no backticks, no explanation. If the question cannot be answered with the given schema, return exactly: UNABLE_TO_QUERY

Database Schema:
${DATABASE_SCHEMA_DDL}

Important rules:
- Only generate SELECT queries, never INSERT/UPDATE/DELETE/DROP.
- Use proper JOINs to connect related tables.
- The "person" table holds the name, age, birthday, and club info. The "player" table adds position info and links to person via person_id. The "coach" table also links to person via person_id.
- To find a player's team name, JOIN player -> person -> team (via person.current_club = team.id).
- To find transfers for a person, JOIN person_club_transfer -> club_transfer.
- To find awards for a player, JOIN player_award -> award.
- To find championship titles for a player, JOIN player_championship_title -> championship_title -> championship.
- Always use snake_case column names.`;

    const sqlQuery = await callOpenAI(apiKey, sqlSystemPrompt, question);

    if (sqlQuery.trim() === "UNABLE_TO_QUERY") {
      return NextResponse.json({
        answer:
          "Sorry, I couldn't find the right data to answer that question with the information available in our database.",
      });
    }

    // ── Step 2: Execute the SQL against Supabase via RPC ──
    const supabase = await createClient();
    const { data: queryResult, error: queryError } = await supabase.rpc(
      "run_readonly_query",
      { sql_query: sqlQuery.trim() }
    );

    if (queryError) {
      // If the SQL fails, return a friendly message
      return NextResponse.json({
        answer:
          "I had trouble looking that up in our database. Could you try rephrasing your question?",
        debug: {
          sql: sqlQuery.trim(),
          error: queryError.message,
        },
      });
    }

    // ── Step 3: Send data back to OpenAI for natural language answer ──
    const answerSystemPrompt = `You are a friendly soccer market expert. The user asked a question and we queried our database for the answer. Based on the data returned, provide a clear, natural, conversational answer. Do not mention SQL, databases, queries, or any technical details. Just answer as if you know this information naturally. If the data is empty or null, say you don't have that information available. Keep answers concise but informative.`;

    const answerUserMessage = `User's question: "${question}"

Data from our records:
${JSON.stringify(queryResult, null, 2)}`;

    const naturalAnswer = await callOpenAI(
      apiKey,
      answerSystemPrompt,
      answerUserMessage
    );

    // ── Step 4: Return the answer ──
    return NextResponse.json({ answer: naturalAnswer });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
