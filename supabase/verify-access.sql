-- Run after migration + ingestion in the explicitly selected disposable test DB.
-- Transaction is rolled back; test reads and blocked writes as anon, not service_role.
begin;
set local role anon;
select count(*) as public_poi_count from public.pois;
select count(*) as bounded_results from public.spot_nearby(71.4304, 51.1282, 3000, 10);
do $$
begin
  begin
    insert into public.pois (id, name, description, category, longitude, latitude, payload, content_hash)
      values ('security-test', 'security-test', '', 'other', 71.43, 51.13, '{"id":"security-test"}', 'test');
    raise exception 'FAIL: anon write unexpectedly succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous INSERT denied';
  end;
  begin
    update public.pois set name = name where false;
    raise exception 'FAIL: anon UPDATE privilege unexpectedly granted';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous UPDATE denied';
  end;
  begin
    delete from public.pois where false;
    raise exception 'FAIL: anon DELETE privilege unexpectedly granted';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous DELETE denied';
  end;
  begin
    perform * from public.ingestion_runs limit 1;
    raise exception 'FAIL: anon can read ingestion logs';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous logs read denied';
  end;
end;
$$;
select 'PASS: anon read and RPC; INSERT, UPDATE, DELETE and private log read denied' as access_verification;
rollback;
