#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program.name("otavia").version("0.0.1");

program.parse();
