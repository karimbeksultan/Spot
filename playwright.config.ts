import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',timeout:60000,fullyParallel:false,workers:1,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:process.env.SPOT_BASE_URL || 'http://127.0.0.1:3000',headless:true,viewport:{width:1366,height:768},screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{...(process.env.SPOT_BROWSER_PATH?{executablePath:process.env.SPOT_BROWSER_PATH}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
});
