--
-- PostgreSQL database dump
--

\restrict qQY35exAdmUcYMXwgHhofiDIRV6QE3Ci7bAyv59VOK3m2WXDXDJFwrSwerhswG3

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: merkle_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merkle_meta (
    id integer DEFAULT 1 NOT NULL,
    root text NOT NULL,
    leaf_count integer NOT NULL,
    generated_at timestamp with time zone NOT NULL,
    CONSTRAINT merkle_meta_id_check CHECK ((id = 1))
);


--
-- Name: merkle_proofs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merkle_proofs (
    address text NOT NULL,
    proof jsonb NOT NULL,
    root text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mint_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mint_receipts (
    token_id integer NOT NULL,
    tx_hash text NOT NULL,
    block_number bigint NOT NULL,
    recipient text NOT NULL,
    minted_at timestamp with time zone DEFAULT now() NOT NULL,
    mpp_tx text,
    fee_payer text,
    kind text
);


--
-- Name: mpp_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mpp_store (
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quest_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_challenges (
    challenge_id uuid DEFAULT gen_random_uuid() NOT NULL,
    quest_id uuid NOT NULL,
    seed bigint NOT NULL,
    answers jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    solved boolean DEFAULT false NOT NULL,
    final_answer character varying(64),
    locked_out boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    solved_at timestamp with time zone
);


--
-- Name: quest_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_entries (
    quest_id uuid DEFAULT gen_random_uuid() NOT NULL,
    twitter character varying(17) NOT NULL,
    code character varying(16) NOT NULL,
    tweet_url text,
    tempo_address character varying(42),
    verified boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refund_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_queue (
    id integer NOT NULL,
    agent text NOT NULL,
    amount numeric NOT NULL,
    mpp_tx text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled boolean DEFAULT false NOT NULL,
    settled_at timestamp with time zone,
    settled_tx text
);


--
-- Name: refund_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refund_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refund_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refund_queue_id_seq OWNED BY public.refund_queue.id;


--
-- Name: refund_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_queue ALTER COLUMN id SET DEFAULT nextval('public.refund_queue_id_seq'::regclass);


--
-- Name: merkle_meta merkle_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merkle_meta
    ADD CONSTRAINT merkle_meta_pkey PRIMARY KEY (id);


--
-- Name: merkle_proofs merkle_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merkle_proofs
    ADD CONSTRAINT merkle_proofs_pkey PRIMARY KEY (address);


--
-- Name: mint_receipts mint_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_receipts
    ADD CONSTRAINT mint_receipts_pkey PRIMARY KEY (token_id);


--
-- Name: mpp_store mpp_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpp_store
    ADD CONSTRAINT mpp_store_pkey PRIMARY KEY (key);


--
-- Name: quest_challenges quest_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_challenges
    ADD CONSTRAINT quest_challenges_pkey PRIMARY KEY (challenge_id);


--
-- Name: quest_entries quest_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_entries
    ADD CONSTRAINT quest_entries_pkey PRIMARY KEY (quest_id);


--
-- Name: refund_queue refund_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_queue
    ADD CONSTRAINT refund_queue_pkey PRIMARY KEY (id);


--
-- Name: quest_challenges uq_challenge_quest; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_challenges
    ADD CONSTRAINT uq_challenge_quest UNIQUE (quest_id);


--
-- Name: quest_entries uq_tempo_address; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_entries
    ADD CONSTRAINT uq_tempo_address UNIQUE (tempo_address);


--
-- Name: quest_entries uq_twitter; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_entries
    ADD CONSTRAINT uq_twitter UNIQUE (twitter);


--
-- Name: idx_challenge_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_expires ON public.quest_challenges USING btree (expires_at);


--
-- Name: idx_challenge_quest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_quest ON public.quest_challenges USING btree (quest_id);


--
-- Name: idx_quest_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_address ON public.quest_entries USING btree (lower((tempo_address)::text));


--
-- Name: idx_quest_twitter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_twitter ON public.quest_entries USING btree (lower((twitter)::text));


--
-- Name: merkle_proofs_root_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merkle_proofs_root_idx ON public.merkle_proofs USING btree (root);


--
-- Name: mint_receipts_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mint_receipts_recipient_idx ON public.mint_receipts USING btree (recipient);


--
-- Name: mint_receipts_tx_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mint_receipts_tx_hash_idx ON public.mint_receipts USING btree (tx_hash);


--
-- Name: mpp_store_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mpp_store_created_at_idx ON public.mpp_store USING btree (created_at);


--
-- Name: refund_queue_unsettled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refund_queue_unsettled_idx ON public.refund_queue USING btree (settled, created_at) WHERE (settled = false);


--
-- Name: quest_challenges quest_challenges_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_challenges
    ADD CONSTRAINT quest_challenges_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quest_entries(quest_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict qQY35exAdmUcYMXwgHhofiDIRV6QE3Ci7bAyv59VOK3m2WXDXDJFwrSwerhswG3

